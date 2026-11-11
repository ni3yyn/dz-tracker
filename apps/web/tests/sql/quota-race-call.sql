SELECT public.create_tracked_order_with_quota(
  :'merchant_id'::UUID,
  :'external_order_id',
  NULL, NULL, NULL, NULL, 'order_placed',
  NULL, NULL, NULL, NULL, NULL, 'direct'
)->>'outcome';
