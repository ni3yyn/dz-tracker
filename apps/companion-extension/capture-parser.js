(function attachTajerTrackCaptureParser(root) {
  'use strict';
  const ALIASES = {
    orderId: ['order_id','orderid','external_order_id','externalorderid','merchant_order_id','merchantorderid','reference_commande','referencecommande','numero_commande','numerocommande','order_reference','orderreference'],
    trackingNumber: ['tracking','tracking_number','trackingnumber','tracking_id','trackingid','parcel_tracking'],
    firstName: ['firstname','first_name','firstName','prenom','prénom'],
    lastName: ['familyname','family_name','familyName','lastname','last_name','lastName','nom_famille'],
    fullName: ['customer_name','customername','client_name','clientname','recipient_name','recipientname','receiver_name','receivername','full_name','fullname','nom_complet','nomcomplet'],
    phone: ['contact_phone','contactphone','customer_phone','customerphone','recipient_phone','recipientphone','receiver_phone','receiverphone','phone','telephone','mobile','tel'],
    productName: ['product_name','productname','item_name','itemname','designation','product','contenu']
  };
  function normalizeKey(value) {
    return String(value).toLowerCase().replace(/[\s.-]/g, '').replace(/_/g, '');
  }
  function asString(value) {
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      return text && text.length <= 512 ? text : '';
    }
    if (Array.isArray(value) && value.length) return asString(value[0]);
    return '';
  }
  function findValue(source, aliases) {
    const wanted = new Set(aliases.map(normalizeKey));
    const queue = [{ value: source, depth: 0 }];
    const seen = new Set();
    while (queue.length) {
      const current = queue.shift();
      const value = current.value;
      if (!value || typeof value !== 'object' || current.depth > 6 || seen.has(value)) continue;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (wanted.has(normalizeKey(key))) {
          const found = asString(child);
          if (found) return found;
        }
      }
      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') queue.push({ value: child, depth: current.depth + 1 });
      }
    }
    return '';
  }
  function decodeRequestBody(requestBody) {
    if (!requestBody || typeof requestBody !== 'object') return null;
    if (requestBody.formData && typeof requestBody.formData === 'object') {
      const form = {};
      for (const [key, values] of Object.entries(requestBody.formData)) {
        form[key] = Array.isArray(values) ? values[0] : values;
      }
      return form;
    }
    if (!Array.isArray(requestBody.raw)) return null;
    try {
      const chunks = requestBody.raw.map((part) => {
        if (!part || !part.bytes) return new Uint8Array();
        return new Uint8Array(part.bytes);
      });
      const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
      if (!size || size > 256000) return null;
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      try { return JSON.parse(decoded); } catch { return null; }
    } catch { return null; }
  }
  function extractParcelIdentity(requestBody) {
    const source = decodeRequestBody(requestBody);
    if (!source) return null;
    const orderId = findValue(source, ALIASES.orderId);
    if (!orderId) return null;
    const firstName = findValue(source, ALIASES.firstName);
    const lastName = findValue(source, ALIASES.lastName);
    const fullName = findValue(source, ALIASES.fullName);
    const safeFullName = fullName && !fullName.includes('*') ? fullName : '';
    const safeNameParts = [firstName, lastName].filter((part) => part && !part.includes('*'));
    const customerName = safeFullName || safeNameParts.join(' ').trim();
    const rawPhone = findValue(source, ALIASES.phone);
    const customerPhone = rawPhone && !rawPhone.includes('*') && rawPhone.replace(/\D/g, '').length >= 8
      ? rawPhone
      : '';
    if (!customerName && !customerPhone) return null;
    return {
      orderId: orderId.slice(0, 255),
      trackingNumber: findValue(source, ALIASES.trackingNumber).slice(0, 128),
      customerName: customerName.slice(0, 200),
      customerPhone: customerPhone.slice(0, 60),
      productName: findValue(source, ALIASES.productName).slice(0, 200),
      capturedAt: new Date().toISOString()
    };
  }
  root.TTCompanionParser = Object.freeze({ decodeRequestBody, extractParcelIdentity });
})(globalThis);
