const normalize = (value) => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const resolveTargetDoc = (target, chapters = [], worldItems = [], characters = []) => {
    const raw = String(target || '').trim();
    if (!raw) return null;
    const collections = [
        ['chapter', chapters, 'title'],
        ['worldItem', worldItems, 'title'],
        ['character', characters, 'name'],
    ];
    for (const [docType, items, labelKey] of collections) {
        const exactId = items.find((item) => item.id === raw);
        if (exactId) return { docType, docId: exactId.id, title: exactId[labelKey] };
    }
    const normalized = normalize(raw);
    for (const [docType, items, labelKey] of collections) {
        const exact = items.find((item) => normalize(item[labelKey]) === normalized);
        if (exact) return { docType, docId: exact.id, title: exact[labelKey] };
    }
    return null;
};

export default resolveTargetDoc;
