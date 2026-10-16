import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { dividendService } from '../lib/DividendService';
import { dividendWithholdingRate } from '../utils/dividendTax';
import { formatNumber } from '../utils/formatters';
import type { Dividend } from '../types/database';
import { logger } from '../utils/logger';

interface DividendEditModalProps {
    dividend: Dividend & { id: number };
    onClose: () => void;
}

/**
 * Edit payment date and tax withheld at source. Synced dividends only know the ex-date,
 * so the real payment date from the broker statement matters for the NBP rate and cash.
 */
export const DividendEditModal: React.FC<DividendEditModalProps> = ({ dividend, onClose }) => {
    const [paymentDate, setPaymentDate] = useState(dividend.paymentDate.slice(0, 10));
    const [withholding, setWithholding] = useState(String(dividendWithholdingRate(dividend)));
    const [isSaving, setIsSaving] = useState(false);

    const rate = parseFloat(withholding);
    const isValid = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(paymentDate) && rate >= 0 && rate <= 100;

    const handleSave = async () => {
        if (!isValid) return;
        setIsSaving(true);
        try {
            await dividendService.updateDividend(dividend.id, { paymentDate, withholdingTaxRate: rate });
            toast.success('Dywidenda zaktualizowana');
            onClose();
        } catch (error) {
            logger.error('Failed to update dividend', error);
            toast.error('Nie udało się zapisać dywidendy');
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div
            data-testid="dividend-edit-modal"
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
        >
            <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-white">Dywidenda {dividend.ticker}</h2>
                        <p className="text-xs text-slate-400">
                            {formatNumber(dividend.totalAmount || 0)} {dividend.currency} brutto •{' '}
                            {dividend.sharesOwned} szt.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="bg-slate-800 p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div>
                    <label className="text-xs text-slate-400 uppercase font-bold ml-1 mb-1 block">Data wypłaty</label>
                    <input
                        data-testid="dividend-payment-date-input"
                        type="date"
                        value={paymentDate}
                        onChange={e => setPaymentDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:border-blue-600 font-mono text-sm [color-scheme:dark]"
                    />
                    <p className="text-[11px] text-slate-500 mt-1 ml-1">
                        Z wyciągu brokera. Od niej zależy kurs NBP (dzień roboczy wcześniej) i data wpływu gotówki.
                    </p>
                </div>

                <div>
                    <label className="text-xs text-slate-400 uppercase font-bold ml-1 mb-1 block">
                        Podatek pobrany u źródła (%)
                    </label>
                    <input
                        data-testid="dividend-withholding-input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={withholding}
                        onChange={e => setWithholding(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:border-blue-600 font-mono text-sm"
                    />
                    <p className="text-[11px] text-slate-500 mt-1 ml-1">
                        {dividend.currency === 'PLN'
                            ? 'Spółki z GPW: 19% pobiera broker, na IKE/IKZE 0%.'
                            : 'Np. USA 15% przy złożonym W-8BEN, 30% bez niego.'}
                    </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm"
                    >
                        Anuluj
                    </button>
                    <button
                        data-testid="dividend-save-button"
                        onClick={handleSave}
                        disabled={!isValid || isSaving}
                        className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm disabled:opacity-50"
                    >
                        {isSaving ? 'Zapisywanie...' : 'Zapisz'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
