export function formatPhoneNumber(phone?: string) {
    if (!phone) return '-';

    // Handles: +919657954641 or 919657954641
    const cleaned = phone.replace(/[^\d+]/g, '');

    if (cleaned.startsWith('+91') && cleaned.length === 13) {
        return cleaned.replace(/^(\+91)(\d{2})(\d{4})(\d{4})$/, '$1 $2 $3 $4');
    }

    // If you also want standard Indian 5-5 grouping (+91 96579 54641):
    // return cleaned.replace(/^(\+91)(\d{5})(\d{5})$/, '$1 $2 $3');

    return phone; // fallback to original if format doesn't match
}
