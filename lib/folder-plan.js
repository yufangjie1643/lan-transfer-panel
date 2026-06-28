export const folderArchiveThresholds = {
  smallFileBytes: 1024 * 1024,
  minSmallFilesToArchive: 10,
};

export function chooseFolderDownloadPlan(summary, thresholds = folderArchiveThresholds) {
  if (summary?.filesTruncated) {
    return {
      strategy: 'unavailable',
      requiresConfirmation: true,
      requiresFullListing: true,
      smallFileBytes: Number(thresholds.smallFileBytes || 1024 * 1024),
      minSmallFilesToArchive: Number(thresholds.minSmallFilesToArchive ?? 10),
      compressionSelectable: false,
    };
  }

  const smallFileBytes = Number(thresholds.smallFileBytes || 1024 * 1024);
  const minSmallFilesToArchive = Number(thresholds.minSmallFilesToArchive ?? 10);
  const files = Array.isArray(summary?.files) ? summary.files : [];
  let archiveFiles = [];
  const directFiles = [];

  for (const file of files) {
    const size = Number(file?.Size || 0);
    if (size < smallFileBytes) archiveFiles.push(file);
    else directFiles.push(file);
  }
  if (archiveFiles.length <= minSmallFilesToArchive) {
    directFiles.unshift(...archiveFiles);
    archiveFiles = [];
  }

  const archive = summarizePlanFiles(archiveFiles);
  const direct = summarizePlanFiles(directFiles);
  const strategy =
    archive.fileCount && direct.fileCount
      ? 'mixed'
      : archive.fileCount
        ? 'archive-small-files'
        : 'files';

  return {
    strategy,
    requiresConfirmation: true,
    smallFileBytes,
    minSmallFilesToArchive,
    archive,
    direct,
    compressionSelectable: false,
  };
}

function summarizePlanFiles(files) {
  return {
    fileCount: files.length,
    totalSize: files.reduce((total, file) => total + Number(file?.Size || 0), 0),
    files,
  };
}
