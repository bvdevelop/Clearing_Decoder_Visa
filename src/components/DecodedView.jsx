import { useState, useMemo } from 'react';
import { ArrowLeft, Database, ChevronDown, ChevronRight, CreditCard, Layers, FileText } from 'lucide-react';
import { parseVisaFile } from '../utils/decoder';

const TransactionBlock = ({ transaction, onToggle, isOpen }) => {
    // Determine summary info from TCR 0 if present
    const tcr0 = transaction.records.find(r => r.tcr === '0');
    // If it's a return (TC 01, 02, 03), we might look at TCR 9 for specific return info, 
    // but TCR 0 (generic) might just be a blob.

    // For TC 05, we have detailed parsing of TCR 0.
    const accountNum = tcr0?.parsedFields?.['Account Number'] || 'Unknown Acct';
    const rawAmount = tcr0?.parsedFields?.['Source Amt'] || '0';
    const currencyCode = tcr0?.parsedFields?.['Source Curr Code'] || '840';
    const merchant = tcr0?.parsedFields?.['Merchant Name'] || 'Unknown Merchant';

    // For Returns, maybe show Reason Code from TCR 9?
    const tcr9 = transaction.records.find(r => r.tcr === '9');
    const returnReason = tcr9?.parsedFields?.['Reason Code 1'];

    const tcrCount = transaction.records.length;
    const isReturn = ['01', '02', '03'].includes(transaction.records[0].tc);
    const txType = transaction.records[0].type.split(' - ')[0]; // Extract base type

    const formatCurrency = (amtStr, code) => {
        const val = parseInt(amtStr, 10) / 100;
        if (code === '986') {
            return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }
        return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    };

    const formattedAmount = formatCurrency(rawAmount, currencyCode);

    return (
        <div style={{
            marginBottom: '0.5rem',
            border: isReturn ? '1px solid var(--warning)' : '1px solid var(--border-color)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-card)',
            overflow: 'hidden'
        }}>
            <div
                onClick={onToggle}
                style={{
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: isOpen ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    borderBottom: isOpen ? '1px solid var(--border-color)' : 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <div className="badge" style={{ background: isReturn ? 'var(--warning)' : '#3b82f6', color: isReturn ? 'black' : 'white' }}>Tx #{transaction.id}</div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{merchant !== 'Unknown Merchant' ? merchant : txType}</span>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem' }}>
                            <span>{accountNum !== 'Unknown Acct' ? accountNum : (returnReason ? `Return Reason: ${returnReason}` : '')}</span>
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    {merchant !== 'Unknown Merchant' && <div style={{ fontWeight: 'bold', color: '#86efac' }}>{formattedAmount}</div>}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{tcrCount} TCRs</div>
                </div>
            </div>

            {isOpen && (
                <div style={{ padding: '0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <tbody>
                            {transaction.records.map((rec) => (
                                <RecordRow key={rec.id} rec={rec} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const RecordRow = ({ rec }) => {
    const isHeaderOrTrailer = ['90', '91', '92'].includes(rec.tc);

    return (
        <tr style={{
            borderBottom: '1px solid var(--border-color)',
            background: isHeaderOrTrailer ? 'rgba(255, 255, 255, 0.03)' : 'transparent'
        }}>
            <td style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)', width: '50px', color: 'var(--text-secondary)' }}>
                {rec.id}
            </td>
            <td style={{ padding: '0.75rem', verticalAlign: 'top', width: '25%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        background: rec.type.includes('Unknown') ? 'var(--error)' : 'rgba(148, 163, 184, 0.2)',
                        color: rec.type.includes('Unknown') ? 'white' : 'var(--text-primary)',
                        fontWeight: 600,
                        fontSize: '0.75rem'
                    }}>
                        {rec.tc}{rec.tcr ? `-${rec.tcr}` : ''}
                    </span>
                    <span style={{ fontWeight: 500 }}>{rec.description || rec.type}</span>
                </div>
            </td>
            <td style={{ padding: '0.75rem' }}>
                {Object.keys(rec.parsedFields).length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
                        {Object.entries(rec.parsedFields).map(([key, val]) => (
                            !key.startsWith('Reserved') && (
                                <div key={key} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.4rem', borderRadius: '4px' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '2px' }}>{key}</div>
                                    <div style={{ color: '#bae6fd', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', wordBreak: 'break-all' }}>{val}</div>
                                </div>
                            )
                        ))}
                    </div>
                ) : (
                    <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                        {rec.raw}
                    </div>
                )}
            </td>
        </tr>
    );
};

const DecodedView = ({ data, fileName, onBack }) => {
    const parsedData = useMemo(() => parseVisaFile(data), [data]);

    // Grouping Logic for UI
    const groupedItems = useMemo(() => {
        const groups = [];
        let currentTransactionParams = null; // { id, records: [] }
        const transactionalTCs = ['05', '06', '15', '16', '25', '26', '01', '02', '03'];

        parsedData.records.forEach(rec => {
            // Group Sales/Drafts and Returns
            if (transactionalTCs.includes(rec.tc)) {
                if (rec.isTransactionStart) {
                    // Push previous transaction if exists
                    if (currentTransactionParams) {
                        groups.push({ type: 'transaction', data: currentTransactionParams });
                    }
                    // Start new
                    currentTransactionParams = { id: rec.transactionId, records: [rec] };
                } else {
                    // Continue existing
                    if (currentTransactionParams) {
                        currentTransactionParams.records.push(rec);
                    } else {
                        // Edge case: orphaned TCR without start logic, treat as new?
                        currentTransactionParams = { id: rec.transactionId, records: [rec] };
                    }
                }
            } else {
                // If we were tracking a transaction, close it
                if (currentTransactionParams) {
                    groups.push({ type: 'transaction', data: currentTransactionParams });
                    currentTransactionParams = null;
                }
                // Push standalone record (Header/Trailer)
                groups.push({ type: 'single', data: rec });
            }
        });
        // Push final transaction
        if (currentTransactionParams) {
            groups.push({ type: 'transaction', data: currentTransactionParams });
        }
        return groups;
    }, [parsedData]);

    const [expandedTx, setExpandedTx] = useState({});
    const [filter, setFilter] = useState('');

    const toggleTx = (id) => {
        setExpandedTx(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const filteredItems = useMemo(() => {
        if (!filter.trim()) return groupedItems;
        const lowerFilter = filter.toLowerCase();
        return groupedItems.filter(group => {
            if (group.type === 'transaction') {
                // Search across all records in this transaction
                return group.data.records.some(r => r.raw.toLowerCase().includes(lowerFilter));
            } else {
                return group.data.raw.toLowerCase().includes(lowerFilter);
            }
        });
    }, [groupedItems, filter]);

    const txCount = groupedItems.filter(g => g.type === 'transaction').length;
    const filteredTxCount = filteredItems.filter(g => g.type === 'transaction').length;

    return (
        <div className="container" style={{ padding: '0 1rem', maxWidth: '1400px' }}>
            <div className="header" style={{ marginBottom: '1.5rem', borderBottom: 'none' }}>
                <button
                    onClick={onBack}
                    className="flex-center"
                    style={{
                        gap: '0.5rem',
                        color: 'var(--text-accent)',
                        background: 'transparent',
                        fontWeight: 600
                    }}
                >
                    <ArrowLeft size={20} />
                    Back to Upload
                </button>
                <div className="badge" style={{ backgroundColor: 'var(--bg-card-hover)', color: 'var(--text-primary)' }}>
                    {fileName} ({data.byteLength} bytes)
                </div>
            </div>

            <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div className="search-bar">
                    <input
                        type="text"
                        placeholder="Search parsed data..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Showing {filteredTxCount} of {txCount} Transactions
                </div>
            </div>

            {parsedData.errors && parsedData.errors.length > 0 && (
                <div style={{ marginBottom: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                    <h4 style={{ color: 'var(--error)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Validation Errors Found ({parsedData.errors.length})
                    </h4>
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {parsedData.errors.map((err, idx) => (
                            <div key={idx} style={{ fontSize: '0.9rem', marginBottom: '0.25rem', fontFamily: 'var(--font-mono)' }}>
                                <span style={{ fontWeight: 'bold' }}>Line {err.line}:</span> {err.message}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={20} /> File Structure
            </h3>
            <span className="badge">{groupedItems.filter(g => g.type === 'transaction').length} Transactions</span>


            <div style={{ paddingBottom: '4rem' }}>
                {filteredItems.map((group, idx) => {
                    if (group.type === 'transaction') {
                        return (
                            <TransactionBlock
                                key={`tx-${group.data.id}-${idx}`}
                                transaction={group.data}
                                isOpen={expandedTx[group.data.id]}
                                onToggle={() => toggleTx(group.data.id)}
                            />
                        );
                    } else {
                        // Single record (Header/Trailer)
                        return (
                            <div key={group.data.id} style={{
                                marginBottom: '0.5rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius)',
                                background: 'var(--bg-card)',
                                overflow: 'hidden'
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <tbody>
                                        <RecordRow rec={group.data} />
                                    </tbody>
                                </table>
                            </div>
                        );
                    }
                })}

                {groupedItems.length === 0 && (
                    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No records parsed. Is this a valid Visa CTF/ITF file?
                    </div>
                )}
            </div>
        </div >
    );
};

export default DecodedView;
