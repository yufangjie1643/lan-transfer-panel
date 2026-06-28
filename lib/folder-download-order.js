export function getFolderDownloadWorkOrder(plan) {
  const order = [];
  if (Number(plan?.archive?.fileCount || 0) > 0) order.push('archive');
  if (Number(plan?.direct?.fileCount || 0) > 0) order.push('direct');
  return order;
}
