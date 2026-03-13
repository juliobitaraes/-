export function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

export function parseDateOnly(value) {
    if (!value) return null;
    if (value && typeof value.toDate === 'function') {
        const raw = value.toDate();
        if (Number.isNaN(raw)) return null;
        return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        const brMatch = trimmed.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
        if (brMatch) return new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
    }
    const d = new Date(value);
    if (Number.isNaN(d)) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatDateOnly(value, locale = 'pt-BR') {
    const d = parseDateOnly(value);
    if (!d) return String(value || '');
    return d.toLocaleDateString(locale);
}

export function toInputDate(value) {
    const d = parseDateOnly(value);
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
