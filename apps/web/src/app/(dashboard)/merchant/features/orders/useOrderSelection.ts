import { useState } from 'react';
import type { GlobalDialogOptions } from '../../../../../components/GlobalDialogProvider';
import { deleteMerchantOrders } from '../../actions';

interface SelectableOrder {
  id: string;
}

interface UseOrderSelectionOptions {
  filteredOrders: SelectableOrder[];
  confirmDialog: (options: GlobalDialogOptions) => Promise<boolean>;
  alertDialog: (options: GlobalDialogOptions) => Promise<void>;
  showToast: (message: string) => void;
  onOrdersDeleted: (orderIds: string[]) => void;
}

export function useOrderSelection({
  filteredOrders,
  confirmDialog,
  alertDialog,
  showToast,
  onOrdersDeleted,
}: UseOrderSelectionOptions) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isDeletingOrders, setIsDeletingOrders] = useState(false);

  const toggleOrderSelection = (orderId: string, checked: boolean) => {
    setSelectedOrderIds((current) => {
      if (checked) {
        return current.includes(orderId) ? current : [...current, orderId];
      }
      return current.filter((id) => id !== orderId);
    });
  };

  const toggleFilteredOrderSelection = (checked: boolean) => {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      for (const order of filteredOrders) {
        if (checked) next.add(order.id);
        else next.delete(order.id);
      }
      return Array.from(next);
    });
  };

  const handleDeleteOrders = async (orderIds: string[]) => {
    const ids = Array.from(new Set(orderIds));
    if (ids.length === 0 || isDeletingOrders) return;

    const confirmationMessage =
      ids.length === 1
        ? 'سيتم حذف الطلب وسجل تحديثاته وروابط الإشعارات المرتبطة به نهائياً. لا يمكن التراجع عن هذا الإجراء.'
        : `سيتم حذف ${ids.length} طلباً وسجلات تحديثاتها وروابط إشعاراتها نهائياً. لا يمكن التراجع عن هذا الإجراء.`;

    const confirmed = await confirmDialog({
      title: ids.length === 1 ? 'حذف الطلب' : 'حذف الطلبات المحددة',
      message: confirmationMessage,
      confirmLabel: ids.length === 1 ? 'حذف الطلب' : `حذف ${ids.length} طلباً`,
      cancelLabel: 'الاحتفاظ بها',
      tone: 'danger',
    });

    if (!confirmed) return;

    setIsDeletingOrders(true);
    try {
      const result = await deleteMerchantOrders(ids);

      if ('error' in result) {
        await alertDialog({
          title: 'تعذر حذف الطلبات',
          message: result.error,
          confirmLabel: 'حسناً',
          tone: 'warning',
        });
        return;
      }

      setSelectedOrderIds((current) => current.filter((id) => !ids.includes(id)));
      onOrdersDeleted(ids);
      showToast(`تم حذف ${result.deletedCount} طلب بنجاح.`);
    } catch (error) {
      console.error('[MerchantDashboard]: Order deletion failed:', error);
      await alertDialog({
        title: 'حدث خطأ أثناء الحذف',
        message: 'تعذر حذف الطلبات حالياً. يرجى المحاولة مجدداً.',
        confirmLabel: 'حسناً',
        tone: 'warning',
      });
    } finally {
      setIsDeletingOrders(false);
    }
  };


  const clearSelectedOrders = () => setSelectedOrderIds([]);

  return {
    selectedOrderIds,
    isDeletingOrders,
    toggleOrderSelection,
    toggleFilteredOrderSelection,
    clearSelectedOrders,
    handleDeleteOrders,
  };
}
