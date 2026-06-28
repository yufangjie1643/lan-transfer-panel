export function publicFolderPlan(plan) {
  return {
    strategy: plan.strategy,
    requiresConfirmation: Boolean(plan.requiresConfirmation),
    smallFileBytes: Number(plan.smallFileBytes || 0),
    minSmallFilesToArchive: Number(plan.minSmallFilesToArchive || 0),
    compressionSelectable: Boolean(plan.compressionSelectable),
    archive: {
      fileCount: Number(plan.archive?.fileCount || 0),
      totalSize: Number(plan.archive?.totalSize || 0),
    },
    direct: {
      fileCount: Number(plan.direct?.fileCount || 0),
      totalSize: Number(plan.direct?.totalSize || 0),
    },
  };
}
