import { DEFAULT_BRAND_SETTINGS } from '@saas/ui';
import type {
  AnimationLevel,
  BackgroundStyle,
  CardRadius,
  CardSurface,
  FontFamily,
  ThemeMode,
  TimelineDesign,
  TimelineEvent,
} from '@saas/ui';
import type {
  BrandPreset,
  BrandingCategory,
  EditableBrandSettings,
  TimelineLineStyle,
} from '../../shared/branding-types';

export const DEFAULT_EDITABLE_BRAND_SETTINGS: EditableBrandSettings = {
  ...DEFAULT_BRAND_SETTINGS,
  brandColor: '#27342D',
  brandSubtitle: '',
  showWhatsAppButton: true,
  animateBackgroundBlobs: false,
  backgroundBlur: true,
  timelineLineStyle: 'straight',
};

export const SAMPLE_PREVIEW_EVENTS: TimelineEvent[] = [
  {
    id: 'sample-1',
    title: 'خرج للتوصيل مع المندوب',
    date: new Date().toISOString(),
    description: 'الشحنة في مرحلة التوصيل النهائية. ستظهر أي تفاصيل جديدة هنا عند تسجيلها.',
    isCurrent: true,
  },
  {
    id: 'sample-2',
    title: 'وصلت إلى مركز التوزيع',
    date: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
    description: 'تم تسجيل وصول الشحنة إلى مركز الفرز والتوزيع.',
    isCurrent: false,
  },
  {
    id: 'sample-3',
    title: 'انطلقت نحو ولاية الوجهة',
    date: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
    description: 'تم تسجيل مغادرة الشحنة من مركز الإرسال.',
    isCurrent: false,
  },
  {
    id: 'sample-4',
    title: 'تم تأكيد الطلب وتجهيزه',
    date: new Date(Date.now() - 3600 * 1000 * 36).toISOString(),
    description: 'اكتمل تجهيز الطلب لإحالته إلى شركة الشحن.',
    isCurrent: false,
  },
];

export const BRANDING_CATEGORIES = [
  { id: 'identity', number: '01', label: 'الهوية', description: 'العلامة والألوان' },
  { id: 'appearance', number: '02', label: 'المظهر', description: 'الخلفية والخطوط والحركة' },
  { id: 'layout', number: '03', label: 'سجل الشحنة', description: 'طريقة عرض مراحل التوصيل' },
  { id: 'customer', number: '04', label: 'معلومات الزبون', description: 'الدعم والمحتوى الظاهر' },
] as const;

export const BRANDING_MOTIFS: Record<string, string> = {
  stars: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22160%22%20height=%22160%22%20viewBox=%220%200%20160%20160%22%3E%3Cg%20fill=%22none%22%20stroke=%22%236D8A78%22%20stroke-opacity=%22.26%22%20stroke-width=%221.25%22%3E%3Cpath%20d=%22M28%2022v12m-6-6h12M116%2042v10m-5-5h10M77%20115v12m-6-6h12%22/%3E%3Ccircle%20cx=%22130%22%20cy=%22122%22%20r=%222%22/%3E%3Ccircle%20cx=%2248%22%20cy=%2282%22%20r=%221.8%22/%3E%3Ccircle%20cx=%2291%22%20cy=%2225%22%20r=%221.4%22/%3E%3C/g%3E%3C/svg%3E")`,
  leaves: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22190%22%20height=%22190%22%20viewBox=%220%200%20190%20190%22%3E%3Cg%20fill=%22none%22%20stroke=%22%2362846A%22%20stroke-opacity=%22.23%22%20stroke-width=%221.4%22%20stroke-linecap=%22round%22%3E%3Cpath%20d=%22M30%20156C55%20122%2067%2089%2073%2035M44%20137C18%20127%2017%20105%2025%2096c19%202%2028%2018%2019%2041ZM56%20113C37%2092%2043%2071%2054%2065c17%2011%2019%2028%202%2048ZM68%2082C75%2059%2097%2053%20109%2060c-3%2021-18%2031-41%2022ZM104%20165c14-28%2029-53%2056-75M126%20132c-3-20%2011-34%2025-34%207%2017-1%2031-25%2034ZM140%20106c-1-20%2013-31%2027-29%205%2018-5%2031-27%2029Z%22/%3E%3C/g%3E%3C/svg%3E")`,
  hearts: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22150%22%20height=%22150%22%20viewBox=%220%200%20150%20150%22%3E%3Cg%20fill=%22none%22%20stroke=%22%23B47791%22%20stroke-opacity=%22.25%22%20stroke-width=%221.35%22%3E%3Cpath%20d=%22M32%2037c-8-9-22%202-13%2013l17%2017%2017-17c9-11-5-22-14-13l-3%204-4-4Z%22/%3E%3Cpath%20d=%22M105%20104c-6-7-17%201-10%209l13%2013%2013-13c7-8-4-16-10-9l-3%203-3-3Z%22/%3E%3Cpath%20d=%22M111%2024c-4-5-12%201-7%206l9%209%209-9c5-5-3-11-7-6l-2%202-2-2Z%22/%3E%3C/g%3E%3C/svg%3E")`,
  waves: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22300%22%20height=%22180%22%20viewBox=%220%200%20300%20180%22%3E%3Cg%20fill=%22none%22%20stroke=%22%234F8790%22%20stroke-opacity=%22.22%22%20stroke-width=%221.35%22%3E%3Cpath%20d=%22M-10%2028C30%206%2062%2049%20102%2028S174%206%20214%2028s72%2021%2096%200M-10%2050C30%2028%2062%2071%20102%2050s72-22%20112%200%2072%2021%2096%200M-10%20112c40-22%2072%2021%20112%200s72-22%20112%200%2072%2021%2096%200M-10%20134c40-22%2072%2021%20112%200s72-22%20112%200%2072%2021%2096%200%22/%3E%3C/g%3E%3C/svg%3E")`,
  arches: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22210%22%20height=%22240%22%20viewBox=%220%200%20210%20240%22%3E%3Cg%20fill=%22none%22%20stroke=%22%23B7775D%22%20stroke-opacity=%22.22%22%20stroke-width=%221.4%22%3E%3Cpath%20d=%22M12%20240V105a93%2093%200%200%201%20186%200v135M31%20240V106a74%2074%200%200%201%20148%200v134M51%20240V108a54%2054%200%200%201%20108%200v132%22/%3E%3Cpath%20d=%22M0%20220h210%22/%3E%3C/g%3E%3C/svg%3E")`,
  contours: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22260%22%20height=%22210%22%20viewBox=%220%200%20260%20210%22%3E%3Cg%20fill=%22none%22%20stroke=%22%23718394%22%20stroke-opacity=%22.22%22%20stroke-width=%221.2%22%3E%3Cpath%20d=%22M-20%2045C18%207%2063%208%2088%2036s62%2035%2093%200%2066-27%20100%204M-20%2062C18%2024%2063%2025%2088%2053s62%2035%2093%200%2066-27%20100%204M-20%2079C18%2041%2063%2042%2088%2070s62%2035%2093%200%2066-27%20100%204M-5%20153c29-29%2062-31%2086-8s49%2028%2075-1%2062-26%2099%204M-5%20170c29-29%2062-31%2086-8s49%2028%2075-1%2062-26%2099%204%22/%3E%3C/g%3E%3C/svg%3E")`,
  blueprint: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22180%22%20height=%22180%22%20viewBox=%220%200%20180%20180%22%3E%3Cg%20fill=%22none%22%20stroke=%22%23527AA1%22%20stroke-opacity=%22.23%22%20stroke-width=%221%22%3E%3Cpath%20d=%22M0%2030H180M0%2060H180M0%2090H180M0%20120H180M0%20150H180M30%200V180M60%200V180M90%200V180M120%200V180M150%200V180%22/%3E%3Ccircle%20cx=%2290%22%20cy=%2290%22%20r=%2228%22/%3E%3Ccircle%20cx=%2290%22%20cy=%2290%22%20r=%2219%22/%3E%3Cpath%20d=%22M90%2053v12M90%20115v12M53%2090h12M115%2090h12M130%2026h20v20h-20zM18%20128h18v18H18z%22/%3E%3C/g%3E%3C/svg%3E")`,
  dunes: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22280%22%20height=%22180%22%20viewBox=%220%200%20280%20180%22%3E%3Cg%20fill=%22none%22%20stroke=%22%23B79A69%22%20stroke-opacity=%22.25%22%20stroke-width=%221.4%22%3E%3Cpath%20d=%22M-10%2080C34%2013%2073%2020%20111%2062s66%2056%2099%2013%2048-43%2080-2M-10%2099C34%2032%2073%2039%20111%2081s66%2056%2099%2013%2048-43%2080-2M-10%20118C34%2051%2073%2058%20111%20100s66%2056%2099%2013%2048-43%2080-2M-10%20151C39%20117%2085%20124%20129%20145s87%2010%20161-4%22/%3E%3C/g%3E%3C/svg%3E")`,
  petals: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22170%22%20height=%22170%22%20viewBox=%220%200%20170%20170%22%3E%3Cg%20fill=%22none%22%20stroke=%22%239B83AF%22%20stroke-opacity=%22.22%22%20stroke-width=%221.4%22%3E%3Cpath%20d=%22M42%2045c-13-17-28-1-13%2011%209%207%2015%2015%2015%2015s6-8%2015-15c15-12%200-28-13-11l-2%203-2-3Z%22/%3E%3Cpath%20d=%22M121%20112c-10-13-22-1-10%209%207%206%2011%2011%2011%2011s5-5%2011-11c12-10%200-22-10-9l-1%202-1-2Z%22/%3E%3Cpath%20d=%22M111%2030v12m-6-6h12M29%20119v10m-5-5h10%22/%3E%3C/g%3E%3C/svg%3E")`,
  zellige: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNDQiIGhlaWdodD0iMTQ0IiB2aWV3Qm94PSIwIDAgMTQ0IDE0NCI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNTI3YjY4IiBzdHJva2Utb3BhY2l0eT0iLjI4IiBzdHJva2Utd2lkdGg9IjEuMSI+PHBhdGggZD0iTTcyIDQgODQgMTYgMTAxIDE0IDEwMyAzMSAxMjAgMzYgMTE1IDUzIDEzMSA2NiAxMjAgNzkgMTI1IDk2IDEwOCAxMDIgMTA2IDExOSA4OSAxMTcgNzIgMTM2IDU1IDExNyAzOCAxMTkgMzYgMTAyIDE5IDk2IDI0IDc5IDkgNjYgMjUgNTMgMjAgMzYgMzcgMzEgMzkgMTQgNTYgMTZaIi8+PHBhdGggZD0iTTcyIDE5IDgzIDM0IDEwMCAzNiA5OCA1MyAxMTEgNjYgOTggODAgMTAwIDk3IDgzIDk5IDcyIDExOSA2MSA5OSA0NCA5NyA0NiA4MCAzMyA2NiA0NiA1MyA0NCAzNiA2MSAzNFoiLz48cGF0aCBkPSJNMCAwIDI0IDAgMCAyNFpNMTIwIDBoMjR2MjRaTTAgMTIwdjI0aDI0Wk0xMjAgMTQ0bDI0LTI0djI0WiIvPjxwYXRoIGQ9Ik0wIDQ4aDE0NE0wIDk2aDE0NE00OCAwdjE0NE05NiAwdjE0NCIgc3Ryb2tlLW9wYWNpdHk9Ii4xMiIvPjwvZz48L3N2Zz4=")`,
  blockprint: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxODAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMTgwIDE4MCI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOWU3MTVhIiBzdHJva2Utb3BhY2l0eT0iLjI4IiBzdHJva2Utd2lkdGg9IjEuMzUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCI+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDUgNDUpIj48Y2lyY2xlIHI9IjgiLz48cGF0aCBkPSJNMC0yMmMtOCA4LTggMTQgMCAxOCA4LTQgOC0xMCAwLTE4Wk0yMiAwYy04LTgtMTQtOC0xOCAwIDQgOCAxMCA4IDE4IDBaTTAgMjJjOC04IDgtMTQgMC0xOC04IDQtOCAxMCAwIDE4Wk0tMjIgMGM4IDggMTQgOCAxOCAwLTQtOC0xMC04LTE4IDBaIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEzNSAxMzUpIj48Y2lyY2xlIHI9IjgiLz48cGF0aCBkPSJNMC0yMmMtOCA4LTggMTQgMCAxOCA4LTQgOC0xMCAwLTE4Wk0yMiAwYy04LTgtMTQtOC0xOCAwIDQgOCAxMCA4IDE4IDBaTTAgMjJjOC04IDgtMTQgMC0xOC04IDQtOCAxMCAwIDE4Wk0tMjIgMGM4IDggMTQgOCAxOCAwLTQtOC0xMC04LTE4IDBaIi8+PC9nPjxwYXRoIGQ9Ik05MCA2djE0bS03LTdoMTRNOTAgMTYwdjE0bS03LTdoMTRNNiA5MGgxNG0tNy03djE0TTE2MCA5MGgxNG0tNy03djE0Ii8+PC9nPjwvc3ZnPg==")`,
  weave: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1NCIgaGVpZ2h0PSI1NCIgdmlld0JveD0iMCAwIDU0IDU0Ij48ZyBmaWxsPSJub25lIiBzdHJva2U9IiM3ZDhhNzciIHN0cm9rZS1vcGFjaXR5PSIuMjMiIHN0cm9rZS13aWR0aD0iMS4xIj48cGF0aCBkPSJNLTYgNiA2LTZNMCAxOCAxOCAwTTEyIDMwIDMwIDEyTTI0IDQyIDQyIDI0TTM2IDU0IDU0IDM2TTQ4IDY2IDY2IDQ4TS02IDQ4IDQ4LTZNNiA2MCA2MCA2Ii8+PHBhdGggZD0iTS02IDE4IDE4IDQyTS02IDMwIDMwIDY2TTYgNiA0OCA0OE0xOC02IDYwIDM2IiBzdHJva2Utb3BhY2l0eT0iLjE0Ii8+PC9nPjwvc3ZnPg==")`,
  mashrabiya: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMTIiIGhlaWdodD0iMTEyIiB2aWV3Qm94PSIwIDAgMTEyIDExMiI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY4NTZGIiBzdHJva2Utb3BhY2l0eT0iLjI1IiBzdHJva2Utd2lkdGg9IjEuMSI+PHBhdGggZD0iTTI4IDAgNTYgMjggODQgMCBNMCAyOCAyOCA1NiAwIDg0IE01NiAyOCA4NCA1NiA1NiA4NCAyOCA1NiA1NiAyOCBNODQgNTYgMTEyIDI4IE0yOCAxMTIgNTYgODQgODQgMTEyIE04NCAwIDExMiAyOCA4NCA1NiAxMTIgODQgODQgMTEyIE0wIDI4aDI4djI4SDAgTTg0IDU2aDI4djI4SDg0IE0yOCAwaDU2IE0yOCAxMTJoNTYiLz48cGF0aCBkPSJNMjggMjhoNTZ2NTZIMjh6IE00MiA0MmgyOHYyOEg0MnoiIHN0cm9rZS1vcGFjaXR5PSIuMTQiLz48L2c+PC9zdmc+")`, 
  amazigh: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNDQiIGhlaWdodD0iOTYiIHZpZXdCb3g9IjAgMCAxNDQgOTYiPjxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0E5NkU1OCIgc3Ryb2tlLW9wYWNpdHk9Ii4yNSIgc3Ryb2tlLXdpZHRoPSIxLjI1IiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMCAyNCAxMiAxMiAyNCAyNCAxMiAzNlogTTI0IDI0IDM2IDEyIDQ4IDI0IDM2IDM2WiBNNDggMjQgNjAgMTIgNzIgMjQgNjAgMzZaIE03MiAyNCA4NCAxMiA5NiAyNCA4NCAzNlogTTk2IDI0IDEwOCAxMiAxMjAgMjQgMTA4IDM2WiBNMTIwIDI0IDEzMiAxMiAxNDQgMjQgMTMyIDM2WiIvPjxwYXRoIGQ9Ik0wIDcyIDEyIDYwIDI0IDcyIDEyIDg0WiBNMjQgNzIgMzYgNjAgNDggNzIgMzYgODRaIE00OCA3MiA2MCA2MCA3MiA3MiA2MCA4NFogTTcyIDcyIDg0IDYwIDk2IDcyIDg0IDg0WiBNOTYgNzIgMTA4IDYwIDEyMCA3MiAxMDggODRaIE0xMjAgNzIgMTMyIDYwIDE0NCA3MiAxMzIgODRaIi8+PHBhdGggZD0iTTEyIDM2djI0bTI0LTI0djI0bTI0LTI0djI0bTI0LTI0djI0bTI0LTI0djI0bTI0LTI0djI0IiBzdHJva2UtZGFzaGFycmF5PSIzIDUiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjQ4IiByPSIyIi8+PGNpcmNsZSBjeD0iNjAiIGN5PSI0OCIgcj0iMiIvPjxjaXJjbGUgY3g9IjEwOCIgY3k9IjQ4IiByPSIyIi8+PC9nPjwvc3ZnPg==")`, 
  embroidery: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTYwIiB2aWV3Qm94PSIwIDAgMTYwIDE2MCI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOEI3OTYzIiBzdHJva2Utb3BhY2l0eT0iLjI1IiBzdHJva2Utd2lkdGg9IjEuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTI2IDE0NWMxNi0yNiAyMy01MCAyOS04M20tOCA1OUMyMyAxMTcgMTYgMTAxIDIyIDg4YzE4IDEgMzAgMTUgMjUgMzNabTgtMjhDNDMgNzcgNDggNjEgNjEgNTdjMTIgMTEgMTAgMjYtNSAzNlptMzggNDdjMTAtMjQgMjItNDcgNDUtNjNtLTI4IDQyYy01LTE2IDQtMjkgMTctMzEgNyAxMyAxIDI2LTE3IDMxWm0xNC0xOWMtMS0xNyAxMC0yNiAyMS0yMyA1IDE1LTQgMjUtMjEgMjNaIi8+PHBhdGggZD0iTTk4IDI4Yy04LTExLTIxIDEtMTEgMTFsMTEgMTEgMTEtMTFjMTAtMTAtMy0yMi0xMS0xMVogTTQwIDM0djEwbS01LTVoMTAgTTExNCAxMTZ2MTBtLTUtNWgxMCIvPjxjaXJjbGUgY3g9Ijk4IiBjeT0iMjgiIHI9IjIiLz48Y2lyY2xlIGN4PSIyNiIgY3k9IjE0NSIgcj0iMiIvPjwvZz48L3N2Zz4=")`,
};

export const BACKGROUND_STYLES: { id: BackgroundStyle; name: string; desc: string; icon: string; previewBg: string }[] = [
  { id: 'aurora', name: 'ضوء شفق', desc: 'هالات ضوئية واسعة بتمويه ناعم يخلق عمقاً هادئاً.', icon: '✧', previewBg: 'radial-gradient(ellipse at 12% 7%, rgba(166,205,177,.7), transparent 45%), radial-gradient(ellipse at 91% 20%, rgba(245,204,148,.48), transparent 44%), #F2F1ED' },
  { id: 'midnight', name: 'ليل مضيء', desc: 'نقاط نجميّة وخطوط ضوء خافتة فوق سطح ليلي.', icon: '✦', previewBg: `radial-gradient(circle at 16% 16%, rgba(215,229,218,.45), transparent 36%), ${BRANDING_MOTIFS.stars}, #222924` },
  { id: 'minimal', name: 'ورق صامت', desc: 'ورق نقي مع انعكاس ضوء خفيف؛ دون زخرفة مشتتة.', icon: '◯', previewBg: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.96), transparent 60%), #F8F8F5' },
  { id: 'sunset', name: 'أقواس الغروب', desc: 'أقواس معمارية تتدرج داخل إضاءة شمس دافئة.', icon: '◒', previewBg: `radial-gradient(ellipse at 85% 15%, rgba(241,174,118,.52), transparent 50%), ${BRANDING_MOTIFS.arches}, #F4EEE5` },
  { id: 'emerald', name: 'أثر نباتي', desc: 'رسوم أوراق خطية خفيفة بطابع طبيعي راقٍ.', icon: '❧', previewBg: `${BRANDING_MOTIFS.leaves}, #EDF1EB` },
  { id: 'mesh', name: 'شبكة تقنية', desc: 'شبكة هندسية مع علامات قياس دقيقة كلوحة تشغيل.', icon: '⌗', previewBg: `linear-gradient(rgba(42,62,52,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(42,62,52,.12) 1px, transparent 1px), ${BRANDING_MOTIFS.blueprint}, #F0F2F1` },
  { id: 'linen' as BackgroundStyle, name: 'نسيج الكتان', desc: 'ألياف ورقية دقيقة تمنح الخلفية ملمساً غير لامع.', icon: '▤', previewBg: 'repeating-linear-gradient(0deg, rgba(112,92,62,.12) 0, rgba(112,92,62,.12) 1px, transparent 1px, transparent 5px), #F2EEE5' },
  { id: 'porcelain' as BackgroundStyle, name: 'قلوب رقيقة', desc: 'قلوب مرسومة بخط رفيع ومتباعدة، بطابع ودود غير طفولي.', icon: '♡', previewBg: `${BRANDING_MOTIFS.hearts}, #F5F0F3` },
  { id: 'slate' as BackgroundStyle, name: 'خرائط كنتورية', desc: 'خطوط تضاريس متدفقة بتباين منخفض وطابع معماري.', icon: '≋', previewBg: `${BRANDING_MOTIFS.contours}, #E6E9EC` },
  { id: 'ocean' as BackgroundStyle, name: 'موج بحري', desc: 'خطوط أمواج متكررة تمنح إحساساً بالحركة والاتساع.', icon: '〰', previewBg: `${BRANDING_MOTIFS.waves}, #E7F1F1` },
  { id: 'terracotta' as BackgroundStyle, name: 'أقواس طينية', desc: 'طبقات أقواس مستوحاة من العمارة المتوسطية.', icon: '⌒', previewBg: `radial-gradient(ellipse at 50% 0%, rgba(255,220,184,.5), transparent 48%), ${BRANDING_MOTIFS.arches}, #F3E8E1` },
  { id: 'plum' as BackgroundStyle, name: 'بتلات ضبابية', desc: 'بتلات وخطوط صغيرة فوق توهج ليلكي خفيف.', icon: '✿', previewBg: `radial-gradient(ellipse at 15% 10%, rgba(218,195,231,.58), transparent 48%), ${BRANDING_MOTIFS.petals}, #F0EBF3` },
  { id: 'blueprint' as BackgroundStyle, name: 'رسم هندسي', desc: 'شبكة ومخطط دائري وعلامات مرجعية شبيهة بالرسومات الفنية.', icon: '⌖', previewBg: `${BRANDING_MOTIFS.blueprint}, #EAF0F7` },
  { id: 'sandstone' as BackgroundStyle, name: 'كثبان رملية', desc: 'خطوط كثبان متراكبة بإحساس عضوي ودفء صحراوي.', icon: '∿', previewBg: `${BRANDING_MOTIFS.dunes}, #F1EEE5` },
  { id: 'zellige' as BackgroundStyle, name: 'زليج حرفي', desc: 'نجوم هندسية مستوحاة من الزليج التقليدي بتباين هادئ.', icon: '✳', previewBg: `${BRANDING_MOTIFS.zellige}, #EDEFE7` },
  { id: 'blockprint' as BackgroundStyle, name: 'طباعة يدوية', desc: 'زخارف نباتية تشبه الأختام المطبوعة يدوياً.', icon: '❋', previewBg: `${BRANDING_MOTIFS.blockprint}, #F3EDE3` },
  { id: 'weave' as BackgroundStyle, name: 'نسيج متشابك', desc: 'خيوط متقاطعة بنمط حرفي هادئ يشبه النسيج.', icon: '▧', previewBg: `${BRANDING_MOTIFS.weave}, #F0F1E9` },
  { id: 'mashrabiya' as BackgroundStyle, name: 'شبكة مشربية', desc: 'شبكة هندسية مخرّمة مستوحاة من المشربية، بظل خفيف ومساحة تنفّس.', icon: '⌘', previewBg: `${BRANDING_MOTIFS.mashrabiya}, #EFF1E9` },
  { id: 'amazigh' as BackgroundStyle, name: 'نسيج أمازيغي', desc: 'معينات وخطوط متناوبة مستوحاة من النسيج التقليدي.', icon: '◇', previewBg: `${BRANDING_MOTIFS.amazigh}, #F2ECE3` },
  { id: 'embroidery' as BackgroundStyle, name: 'تطريز يدوي', desc: 'خطوط نباتية دقيقة وغرز زخرفية بإحساس مصنوع يدوياً.', icon: '✿', previewBg: `${BRANDING_MOTIFS.embroidery}, #F2F0E8` },
  { id: 'blobs' as BackgroundStyle, name: 'أشكال عضوية', desc: 'كتل لونية عضوية ناعمة موزعة كطبقات إضاءة ضبابية.', icon: '◉', previewBg: 'radial-gradient(ellipse at 16% 18%, rgba(104,157,126,.5), transparent 36%), radial-gradient(ellipse at 84% 77%, rgba(207,145,115,.5), transparent 38%), #F2F0EA' },
];

export const TIMELINE_DESIGNS: { id: TimelineDesign; name: string; desc: string; icon: string }[] = [
  { id: 'stepper', name: 'مسار متصل', desc: 'خط رفيع ونقاط بسيطة لتسلسل كلاسيكي هادئ.', icon: '│' },
  { id: 'cards', name: 'بطاقات مستقلة', desc: 'كل تحديث بطاقة منفصلة بحد وظل ومساحة خاصة.', icon: '▤' },
  { id: 'journey', name: 'مسار متقطع', desc: 'عُقد مائلة ومسار متقطع يوحي بمحطات الرحلة.', icon: '◇' },
  { id: 'compact', name: 'سجل مضغوط', desc: 'عنوان وتوقيت في سطر واحد مع فواصل متقطعة.', icon: '≡' },
  { id: 'rail' as TimelineDesign, name: 'سكة العلامة', desc: 'سكة سميكة بلون المتجر مع علامات مربعة بارزة.', icon: '┃' },
  { id: 'editorial' as TimelineDesign, name: 'تحرير زمني', desc: 'عناوين كبيرة، توقيت أسفلها وفواصل على الهامش.', icon: '¶' },
  { id: 'milestones' as TimelineDesign, name: 'لوحات المحطات', desc: 'كل مرحلة لوحة بصبغة خفيفة وحد جانبي، دون مسار.', icon: '▰' },
  { id: 'numbered' as TimelineDesign, name: 'خطوات مرقّمة', desc: 'أرقام متتابعة داخل مربعات واضحة متصلة بخط.', icon: '①' },
  { id: 'dossier' as TimelineDesign, name: 'ملف الشحنة', desc: 'سجل جدولي مفتوح مع ترقيم وفواصل، بلا علامات مسار.', icon: '▥' },
];

export const TIMELINE_LINE_STYLES: { id: TimelineLineStyle; name: string; desc: string; icon: string }[] = [
  { id: 'straight', name: 'خط مستقيم', desc: 'اتصال رفيع وواضح بين النقاط.', icon: '│' },
  { id: 'dashed', name: 'متقطع', desc: 'مقاطع قصيرة توحي بمراحل منفصلة.', icon: '┆' },
  { id: 'dotted', name: 'منقّط', desc: 'نقاط صغيرة بإيقاع خفيف.', icon: '⁝' },
  { id: 'curved', name: 'منحني', desc: 'انحناءات ناعمة تصل كل محطة بالتالية.', icon: '∿' },
  { id: 'wave', name: 'متموّج', desc: 'مسار عضوي متموّج بدلاً من خط عمودي.', icon: '〰' },
  { id: 'none', name: 'بلا خط', desc: 'نقاط مستقلة دون وصل بصري.', icon: '·' },
];

export const CARD_SURFACES: { id: CardSurface; name: string; desc: string; icon: string }[] = [
  { id: 'glass', name: 'سطح شفاف', desc: 'شفافية محدودة؛ الأفضل مع خلفية هادئة.', icon: '◌' },
  { id: 'solid', name: 'محتوى مفتوح', desc: 'تفاصيل الحالة فوق الخلفية مباشرة، دون بطاقة ممتلئة.', icon: '↔' },
  { id: 'bordered', name: 'إطار تحريري', desc: 'حدود دقيقة تفصل المحتوى بلا ظلال.', icon: '▱' },
  { id: 'borderless', name: 'تخطيط مفتوح', desc: 'محتوى مباشر بلا إطار أو طبقات إضافية.', icon: '↔' },
  { id: 'elevated' as CardSurface, name: 'طبقات مرتفعة', desc: 'ظل عميق خفيف يرفع بطاقة التتبع عن الخلفية.', icon: '▱' },
  { id: 'tinted' as CardSurface, name: 'صبغة العلامة', desc: 'خلفية ملونة بنسبة منخفضة مشتقة من لون المتجر.', icon: '◈' },
  { id: 'paper' as CardSurface, name: 'ورق فاخر', desc: 'سطح دافئ مع حد رفيع وظل قصير جداً.', icon: '▤' },
  { id: 'inset' as CardSurface, name: 'سطح غائر', desc: 'طبقة داخلية هادئة بإطار دقيق بلا ظل خارجي.', icon: '▱' },
];

export const CARD_RADII: { id: CardRadius; name: string; px: string }[] = [
  { id: 'sleek', name: 'زوايا دقيقة (14px)', px: '14px' },
  { id: 'modern', name: 'زوايا متوازنة (26px)', px: '26px' },
  { id: 'pebble', name: 'زوايا لينة (38px)', px: '38px' },
];

export function getBrandContrastRatio(hex: string, backgroundHex: string): number {
  const luminance = (value: string) => {
    const normalized = value.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) return 0.2;
    const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized;
    const channels = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const a = luminance(hex);
  const b = luminance(backgroundHex);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function getReadableOnBrand(hex: string): string {
  return getBrandContrastRatio(hex, '#FFFFFF') >= getBrandContrastRatio(hex, '#17211B') ? '#FFFFFF' : '#17211B';
}

export function getReadableBrandAccent(hex: string, themeMode: string | undefined): string {
  const dark = themeMode === 'dark';
  const canvas = dark ? '#202622' : '#F4F5F1';
  if (getBrandContrastRatio(hex, canvas) >= 4.5) return hex;
  return dark ? '#D4E6D8' : '#28513B';
}


export const BRAND_PALETTES = [
  { name: 'فحمي رصين', hex: '#27342D' },
  { name: 'أزرق عميق', hex: '#315A70' },
  { name: 'أخضر غابي', hex: '#35634A' },
  { name: 'بنفسجي داكن', hex: '#635174' },
  { name: 'قرمزي هادئ', hex: '#A34F4F' },
  { name: 'أزرق مخضر', hex: '#39736D' },
  { name: 'وردي ترابي', hex: '#A75D70' },
  { name: 'عنبري دافئ', hex: '#A87536' },
];

export const FONT_FAMILIES: { id: FontFamily; name: string; sample: string }[] = [
  { id: 'readex',   name: 'Readex Pro',          sample: 'سريع وعصري' },
  { id: 'cairo',    name: 'Cairo',               sample: 'أنيق ومتوازن' },
  { id: 'tajawal',  name: 'Tajawal',             sample: 'خط عربي حديث' },
  { id: 'ibm-plex', name: 'IBM Plex Arabic',     sample: 'تقني واحترافي' },
  { id: 'noto-kufi',name: 'Noto Kufi Arabic',    sample: 'كوفي أصيل' },
];

export const ANIMATION_LEVELS: { id: AnimationLevel; name: string; desc: string; icon: string }[] = [
  { id: 'full',   name: 'حركة كاملة',   desc: 'انتقالات أوضح مع بقاء المحتوى مقروءاً', icon: '∿' },
  { id: 'subtle', name: 'حركة هادئة', desc: 'انتقالات قصيرة دون تشتيت', icon: '⌁' },
  { id: 'none',   name: 'ثابت',   desc: 'من دون انتقالات أو حركات إضافية', icon: '—' },
];

export const BRAND_PRESETS: BrandPreset[] = [
  { id: 'atelier', name: 'Atelier', description: 'حرفي، دافئ، ومساحة مفتوحة', colors: ['#4F6A55', '#F2F0E8', '#C6A47A'], settings: { brandColor: '#4F6A55', bgStyle: 'zellige' as BackgroundStyle, themeMode: 'light' as ThemeMode, cardSurface: 'solid' as CardSurface, cardRadius: 'modern' as CardRadius, timelineDesign: 'editorial' as TimelineDesign, timelineLineStyle: 'curved', fontFamily: 'cairo' as FontFamily, animationLevel: 'subtle' as AnimationLevel, backgroundBlur: true, animateBackgroundBlobs: false } },
  { id: 'botanical', name: 'Botanical', description: 'عضوي وهادئ مع إضاءة ناعمة', colors: ['#416B52', '#E9EFE7', '#D6AC91'], settings: { brandColor: '#416B52', bgStyle: 'blobs' as BackgroundStyle, themeMode: 'light' as ThemeMode, cardSurface: 'glass' as CardSurface, cardRadius: 'pebble' as CardRadius, timelineDesign: 'journey' as TimelineDesign, timelineLineStyle: 'wave', fontFamily: 'tajawal' as FontFamily, animationLevel: 'subtle' as AnimationLevel, backgroundBlur: true, animateBackgroundBlobs: true } },
  { id: 'editorial', name: 'Editorial', description: 'طباعة واضحة وفواصل دقيقة', colors: ['#27342D', '#F7F7F2', '#B9BDB2'], settings: { brandColor: '#27342D', bgStyle: 'minimal' as BackgroundStyle, themeMode: 'light' as ThemeMode, cardSurface: 'borderless' as CardSurface, cardRadius: 'sleek' as CardRadius, timelineDesign: 'editorial' as TimelineDesign, timelineLineStyle: 'straight', fontFamily: 'ibm-plex' as FontFamily, animationLevel: 'none' as AnimationLevel, backgroundBlur: false, animateBackgroundBlobs: false } },
  { id: 'obsidian', name: 'Obsidian', description: 'داكن، تقني، وتباين واضح', colors: ['#B4D4C0', '#202722', '#647D70'], settings: { brandColor: '#B4D4C0', bgStyle: 'midnight' as BackgroundStyle, themeMode: 'dark' as ThemeMode, cardSurface: 'elevated' as CardSurface, cardRadius: 'modern' as CardRadius, timelineDesign: 'rail' as TimelineDesign, timelineLineStyle: 'dashed', fontFamily: 'readex' as FontFamily, animationLevel: 'subtle' as AnimationLevel, backgroundBlur: true, animateBackgroundBlobs: false } },
  { id: 'playful', name: 'Playful', description: 'ألوان مرحة وتفاصيل أكثر ليونة', colors: ['#9A536B', '#F4EAF0', '#E3B27F'], settings: { brandColor: '#9A536B', bgStyle: 'porcelain' as BackgroundStyle, themeMode: 'light' as ThemeMode, cardSurface: 'tinted' as CardSurface, cardRadius: 'pebble' as CardRadius, timelineDesign: 'milestones' as TimelineDesign, timelineLineStyle: 'wave', fontFamily: 'cairo' as FontFamily, animationLevel: 'full' as AnimationLevel, backgroundBlur: true, animateBackgroundBlobs: false } },
];

export const BRAND_CATEGORY_DEFAULT_KEYS: Record<BrandingCategory, (keyof EditableBrandSettings)[]> = {
  identity: ['brandColor', 'brandSubtitle'],
  appearance: ['bgStyle', 'themeMode', 'backgroundBlur', 'cardSurface', 'cardRadius', 'fontFamily', 'animationLevel', 'animateBackgroundBlobs'],
  layout: ['timelineDesign', 'timelineLineStyle'],
  customer: ['showWhatsAppButton', 'supportPhone', 'announcementText', 'showCarrierBadge', 'showProductSection', 'showOrderNumberBadge'],
};
