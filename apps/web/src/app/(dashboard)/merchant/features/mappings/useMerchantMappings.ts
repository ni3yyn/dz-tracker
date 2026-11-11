import { useState } from 'react';
import { applyPresetMappings, deleteStatusMapping } from '../../actions';

interface UseMerchantMappingsOptions {
  merchantId: string;
  showToast: (message: string) => void;
}

export function useMerchantMappings({ merchantId, showToast }: UseMerchantMappingsOptions) {
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [editDisplayStatus, setEditDisplayStatus] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleSaveInlineEdit = async (sourceStatus: string) => {
    if (!editDisplayStatus.trim()) return;
    setIsSavingEdit(true);

    const fd = new FormData();
    fd.append('merchant_id', merchantId);
    fd.append('source_status', sourceStatus);
    fd.append('display_status', editDisplayStatus);

    const { saveStatusMapping } = await import('./actions');
    await saveStatusMapping(fd);

    setEditingMappingId(null);
    setIsSavingEdit(false);
    showToast('تم حفظ المطابقة بنجاح');
  };

  const handleCancelInlineEdit = () => setEditingMappingId(null);

  const handleBeginInlineEdit = (id: string, displayStatus: string) => {
    setEditingMappingId(id);
    setEditDisplayStatus(displayStatus);
  };

  const handleApplyPreset = async (formData: FormData) => {
    await applyPresetMappings(formData);
    showToast('تم تطبيق الحزمة بنجاح');
  };

  const handleDeleteMapping = async (formData: FormData) => {
    await deleteStatusMapping(formData);
    showToast('تم حذف المطابقة بنجاح');
  };

  return {
    editingMappingId,
    editDisplayStatus,
    setEditDisplayStatus,
    isSavingEdit,
    handleSaveInlineEdit,
    handleCancelInlineEdit,
    handleBeginInlineEdit,
    handleApplyPreset,
    handleDeleteMapping,
  };
}
