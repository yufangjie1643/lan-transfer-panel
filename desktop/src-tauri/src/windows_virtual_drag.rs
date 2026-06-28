use std::mem::ManuallyDrop;
use std::mem::{size_of, zeroed};
use std::io::Read;
use std::sync::Mutex;

use windows::core::{implement, Error, Result, PCWSTR};
use windows::Win32::Foundation::{
    BOOL, DATA_S_SAMEFORMATETC, DRAGDROP_S_CANCEL, DRAGDROP_S_DROP,
    DRAGDROP_S_USEDEFAULTCURSORS, E_NOTIMPL, HGLOBAL, S_FALSE, S_OK,
};
use windows::Win32::System::Com::{
    DVASPECT_CONTENT, FORMATETC, IDataObject, IDataObject_Impl, IEnumFORMATETC, STGMEDIUM,
    STGMEDIUM_0, TYMED_HGLOBAL,
};
use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::Ole::{
    DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, OleUninitialize, DROPEFFECT,
    DROPEFFECT_COPY,
};
use windows::Win32::System::SystemServices::{MODIFIERKEYS_FLAGS, MK_LBUTTON};
use windows::Win32::UI::Shell::{FILEDESCRIPTORW, FD_ATTRIBUTES, FD_FILESIZE};

const FILE_ATTRIBUTE_NORMAL: u32 = 0x80;

pub fn start_virtual_download_drag(
    name: String,
    remote_path: String,
    download_url: String,
    size: Option<u64>,
) -> std::result::Result<(), String> {
    let safe_name = safe_virtual_file_name(&name);
    if download_url.trim().is_empty() {
        return Err("download_url is required".to_string());
    }

    unsafe {
        OleInitialize(None).map_err(|err| format!("OleInitialize failed: {err}"))?;
        let result = do_drag_drop(safe_name, remote_path, download_url, size);
        OleUninitialize();
        result.map_err(|err| format!("DoDragDrop failed: {err}"))
    }
}

unsafe fn do_drag_drop(
    name: String,
    remote_path: String,
    download_url: String,
    size: Option<u64>,
) -> Result<()> {
    let data_object: IDataObject = VirtualFileDataObject::new(name, remote_path, download_url, size).into();
    let drop_source: IDropSource = VirtualDropSource.into();
    let mut effect = DROPEFFECT(0);
    DoDragDrop(&data_object, &drop_source, DROPEFFECT_COPY, &mut effect).ok()
}

#[implement(IDataObject)]
struct VirtualFileDataObject {
    file_descriptor_format: u16,
    file_contents_format: u16,
    name: String,
    remote_path: String,
    download_url: String,
    size: Option<u64>,
    content_cache: Mutex<Option<Vec<u8>>>,
}

impl VirtualFileDataObject {
    unsafe fn new(name: String, remote_path: String, download_url: String, size: Option<u64>) -> Self {
        Self {
            file_descriptor_format: RegisterClipboardFormatW(PCWSTR(wide_null("FileGroupDescriptorW").as_ptr())) as u16,
            file_contents_format: RegisterClipboardFormatW(PCWSTR(wide_null("FileContents").as_ptr())) as u16,
            name,
            remote_path,
            download_url,
            size,
            content_cache: Mutex::new(None),
        }
    }

    unsafe fn file_group_descriptor_medium(&self) -> Result<STGMEDIUM> {
        let bytes = size_of::<u32>() + size_of::<FILEDESCRIPTORW>();
        let handle = GlobalAlloc(GMEM_MOVEABLE, bytes)?;
        let ptr = GlobalLock(handle) as *mut u8;
        if ptr.is_null() {
            return Err(Error::from_win32());
        }

        *(ptr as *mut u32) = 1;
        let descriptor = ptr.add(size_of::<u32>()) as *mut FILEDESCRIPTORW;
        *descriptor = zeroed();
        (*descriptor).dwFlags = (FD_ATTRIBUTES.0 | FD_FILESIZE.0) as u32;
        (*descriptor).dwFileAttributes = FILE_ATTRIBUTE_NORMAL;
        let size = self.size.unwrap_or(0);
        (*descriptor).nFileSizeHigh = (size >> 32) as u32;
        (*descriptor).nFileSizeLow = (size & 0xffff_ffff) as u32;
        write_wide_fixed_ptr(
            std::ptr::addr_of_mut!((*descriptor).cFileName) as *mut u16,
            260,
            &self.name,
        );

        let _ = GlobalUnlock(handle);
        Ok(hglobal_medium(handle))
    }

    unsafe fn file_contents_medium(&self) -> Result<STGMEDIUM> {
        let content = self.download_content_cached().map_err(|message| {
            Error::new(
                windows::core::HRESULT(0x80004005_u32 as i32),
                format!("download {} failed: {}", self.remote_path, message),
            )
        })?;
        let handle = GlobalAlloc(GMEM_MOVEABLE, content.len())?;
        let ptr = GlobalLock(handle) as *mut u8;
        if ptr.is_null() {
            return Err(Error::from_win32());
        }
        std::ptr::copy_nonoverlapping(content.as_ptr(), ptr, content.len());
        let _ = GlobalUnlock(handle);
        Ok(hglobal_medium(handle))
    }

    fn download_content_cached(&self) -> std::result::Result<Vec<u8>, String> {
        let mut cache = self.content_cache.lock().map_err(|err| err.to_string())?;
        if let Some(content) = cache.as_ref() {
            return Ok(content.clone());
        }
        let content = self.download_content()?;
        *cache = Some(content.clone());
        Ok(content)
    }

    fn download_content(&self) -> std::result::Result<Vec<u8>, String> {
        let response = ureq::get(&self.download_url)
            .timeout(std::time::Duration::from_secs(60 * 60))
            .call()
            .map_err(|err| err.to_string())?;
        if !(200..300).contains(&response.status()) {
            return Err(format!("HTTP {}", response.status()));
        }
        let mut reader = response.into_reader();
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).map_err(|err| err.to_string())?;
        Ok(bytes)
    }
}

#[allow(non_snake_case)]
impl IDataObject_Impl for VirtualFileDataObject_Impl {
    fn GetData(&self, pformatetcin: *const FORMATETC) -> Result<STGMEDIUM> {
        unsafe {
            if pformatetcin.is_null() {
                return Err(Error::from_win32());
            }
            let format = *pformatetcin;
            if format.dwAspect != DVASPECT_CONTENT.0 as u32
                || (format.tymed & TYMED_HGLOBAL.0 as u32) == 0
            {
                return Err(Error::new(S_FALSE.into(), "unsupported tymed/aspect"));
            }
            if format.cfFormat == self.file_descriptor_format {
                return self.file_group_descriptor_medium();
            }
            if format.cfFormat == self.file_contents_format {
                return self.file_contents_medium();
            }
            Err(Error::new(S_FALSE.into(), "unsupported format"))
        }
    }

    fn GetDataHere(&self, _pformatetc: *const FORMATETC, _pmedium: *mut STGMEDIUM) -> Result<()> {
        Err(E_NOTIMPL.into())
    }

    fn QueryGetData(&self, pformatetc: *const FORMATETC) -> windows::core::HRESULT {
        unsafe {
            if pformatetc.is_null() {
                return S_FALSE;
            }
            let format = *pformatetc;
            if format.dwAspect == DVASPECT_CONTENT.0 as u32
                && (format.tymed & TYMED_HGLOBAL.0 as u32) != 0
                && (format.cfFormat == self.file_descriptor_format
                    || format.cfFormat == self.file_contents_format)
            {
                return S_OK;
            }
            S_FALSE
        }
    }

    fn GetCanonicalFormatEtc(
        &self,
        _pformatectin: *const FORMATETC,
        pformatetcout: *mut FORMATETC,
    ) -> windows::core::HRESULT {
        unsafe {
            if !pformatetcout.is_null() {
                (*pformatetcout).ptd = std::ptr::null_mut();
            }
        }
        DATA_S_SAMEFORMATETC
    }

    fn SetData(&self, _pformatetc: *const FORMATETC, _pmedium: *const STGMEDIUM, _frelease: BOOL) -> Result<()> {
        Err(E_NOTIMPL.into())
    }

    fn EnumFormatEtc(&self, _dwdirection: u32) -> Result<IEnumFORMATETC> {
        Err(E_NOTIMPL.into())
    }

    fn DAdvise(
        &self,
        _pformatetc: *const FORMATETC,
        _advf: u32,
        _padvsink: Option<&windows::Win32::System::Com::IAdviseSink>,
    ) -> Result<u32> {
        Err(E_NOTIMPL.into())
    }

    fn DUnadvise(&self, _dwconnection: u32) -> Result<()> {
        Err(E_NOTIMPL.into())
    }

    fn EnumDAdvise(&self) -> Result<windows::Win32::System::Com::IEnumSTATDATA> {
        Err(E_NOTIMPL.into())
    }
}

#[implement(IDropSource)]
struct VirtualDropSource;

#[allow(non_snake_case)]
impl IDropSource_Impl for VirtualDropSource_Impl {
    fn QueryContinueDrag(
        &self,
        fescapepressed: BOOL,
        grfkeystate: MODIFIERKEYS_FLAGS,
    ) -> windows::core::HRESULT {
        if fescapepressed.as_bool() {
            return DRAGDROP_S_CANCEL;
        }
        if (grfkeystate.0 & MK_LBUTTON.0) == 0 {
            return DRAGDROP_S_DROP;
        }
        S_OK
    }

    fn GiveFeedback(&self, _dweffect: DROPEFFECT) -> windows::core::HRESULT {
        DRAGDROP_S_USEDEFAULTCURSORS
    }
}

fn hglobal_medium(handle: HGLOBAL) -> STGMEDIUM {
    STGMEDIUM {
        tymed: TYMED_HGLOBAL.0 as u32,
        u: STGMEDIUM_0 { hGlobal: handle },
        pUnkForRelease: ManuallyDrop::new(None),
    }
}

unsafe fn write_wide_fixed_ptr(target: *mut u16, len: usize, value: &str) {
    let mut encoded: Vec<u16> = value.encode_utf16().collect();
    if encoded.len() >= len {
        encoded.truncate(len - 1);
    }
    for index in 0..len {
        *target.add(index) = 0;
    }
    std::ptr::copy_nonoverlapping(encoded.as_ptr(), target, encoded.len());
}

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn safe_virtual_file_name(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .to_string();
    if cleaned.is_empty() {
        "download.bin".to_string()
    } else {
        cleaned
    }
}
