// Parsing logic for VISA Clearing Files (CTF/ITF)
// Structure: Text-based, 168 characters per line initially, delimited by CRLF.
// Total line length including CRLF might be 170.

export const parseVisaFile = (buffer) => {
    const textDecoder = new TextDecoder('ascii');
    const fullText = textDecoder.decode(buffer);

    // Split by newlines
    // Split by newlines and filter out empty lines and lines starting with '00' (padding)
    const lines = fullText.split(/\r?\n/).filter(line => line.length > 0 && !line.startsWith('00'));
    const errors = [];

    let transactionCount = 0;
    let lastTCR = -1;
    let lastTC46Group = '';
    let lastTC46Subgroup = '';

    const extract = (lineObj, name, start, end, type) => {
        const val = lineObj.line.substring(start, end);
        if (type === 'UN') {
            if (!/^\d+$/.test(val)) {
                errors.push({
                    line: lineObj.index + 1,
                    field: name,
                    value: val,
                    message: `${name} has an Unpacked Format (UN) which is not allowed to have letters or special characters. Value: ${val}`
                });
            }
        }
        return val;
    };

    const records = lines.map((originalLine, index) => {
        let line = originalLine;

        // ITF Handling: Check for 2 spaces after TC (indices 2 and 3)
        // If present, remove them to normalize to CTF structure
        if (line.length >= 4 && line.substring(2, 4) === '  ') {
            line = line.substring(0, 2) + line.substring(4);
        }

        const lineObj = { line, index };
        const tc = line.substring(0, 2);
        let recordType = 'Unknown';
        let description = '';
        let tcr = ''; // Keep as string for display
        let tcrInt = -1;
        let parsedFields = {};
        let isTransactionStart = false;

        if (tc === '90') {
            recordType = 'Header (TC 90)';
            description = 'File Header';
            parsedFields = {
                'Transaction Code': tc,
                'Center Information Block': line.substring(2, 8),
                'Processing Date': line.substring(8, 13),
                'Reserved_1': line.substring(13, 29),
                'Test Option': line.substring(29, 33),
                'Reserved_2': line.substring(33, 62),
                'Security Code': line.substring(62, 70),
                'Reserved_3': line.substring(70, 76),
                'Outgoing File ID': line.substring(76, 79),
                'Reserved_4': line.substring(79, 168)
            };
            // Reset transaction tracking on header
            transactionCount = 0;
            lastTCR = -1;

        } else if (tc === '91' || tc === '92') {
            const isBatch = tc === '91';
            recordType = isBatch ? 'Batch Trailer (TC 91)' : 'File Trailer (TC 92)';
            description = isBatch ? 'Batch Trailer' : 'File Trailer';

            parsedFields = {
                'Transaction Code': tc,
                'TC Qualifier': line.substring(2, 3),                        // 3
                'TC Sequence': line.substring(3, 4),                         // 4
                'Center Info Block': line.substring(4, 10),                  // 5-10 (6)
                'Processing Date': line.substring(10, 15),                   // 11-15 (5)
                'Destination Amount': line.substring(15, 30),                // 16-30 (15)
                'Num Monetary Tx': line.substring(30, 42),                   // 31-42 (12)
                'Batch Number': line.substring(42, 48),                      // 43-48 (6)
                'Num TCRs': line.substring(48, 60),                          // 49-60 (12)
                'Reserved_1': line.substring(60, 66),                        // 61-66 (6)
                'Center Batch ID': line.substring(66, 74),                   // 67-74 (8)
                'Num Transactions': line.substring(74, 83),                  // 75-83 (9)
                'Reserved_2': line.substring(83, 101),                       // 84-101 (18)
                'Source Amount': line.substring(101, 116),                   // 102-116 (15)
                'Reserved_3': line.substring(116, 168)                       // 117-168 (Rest)
            };
            lastTCR = -1;
        } else if (['05', '06', '15', '16', '25', '26', '04'].includes(tc)) {
            // Draft Data Transactions (TC 05, 06, 15, 16, 25, 26, 04)
            // They all share the same TCR structure (0, 1, 2, 5, 7, etc.)
            const draftTypeMap = {
                '05': 'Sales Draft (TC 05)',
                '06': 'Credit Voucher (TC 06)',
                '15': 'Dispute Fin. Draft (TC 15)',
                '16': 'Dispute Fin. Credit (TC 16)',
                '25': 'Reversal Draft (TC 25)',
                '26': 'Reversal Credit (TC 26)',
                '04': 'Reclassification Advice (TC 04)'
            };

            // Pos 4 (Index 3) is TCR Sequence Number
            const tcrChar = line.charAt(3);
            tcr = tcrChar;
            tcrInt = parseInt(tcrChar, 10);

            if (isNaN(tcrInt)) tcrInt = 0; // Fallback

            // Logic: "When the TCR of the next line is lower than the actual line, then you know it's a new transaction."
            // We interpret this as: If current TCR <= lastTCR, it's a new transaction (e.g. 0 following 2).
            // Also if it's the first TC of this group ever.
            if (tcrInt <= lastTCR || lastTCR === -1) {
                transactionCount++;
                isTransactionStart = true;
            }
            lastTCR = tcrInt;

            recordType = `${draftTypeMap[tc]} - TCR ${tcr}`;

            // TCR Field Parsing
            if (tcr === '0') {
                description = 'Draft Data (TCR 0)';
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),
                    'Transaction Code Qualifier': line.substring(2, 3),
                    'Transaction Component Sequence Number': line.substring(3, 4),
                    'Account Number': extract(lineObj, 'Account Number', 4, 20, 'UN'),
                    'Account Number Extension': extract(lineObj, 'Account Number Extension', 20, 23, 'UN'),
                    'Floor Limit Indicator': line.substring(23, 24),
                    'CRB/Exception File Indicator': line.substring(24, 25),
                    'Reserved_1': line.substring(25, 26),
                    'Acquirer Reference Number': extract(lineObj, 'Acquirer Reference Number', 26, 49, 'UN'),
                    'Acquirer\'s Business ID': extract(lineObj, 'Acquirer\'s Business ID', 49, 57, 'UN'),
                    'Purchase Date (MMDD)': extract(lineObj, 'Purchase Date (MMDD)', 57, 61, 'UN'),
                    'Destination Amount': extract(lineObj, 'Destination Amount', 61, 73, 'UN'),
                    'Destination Currency Code': line.substring(73, 76),
                    'Source Amount': extract(lineObj, 'Source Amount', 76, 88, 'UN'),
                    'Source Currency Code': line.substring(88, 91),
                    'Merchant Name': line.substring(91, 116),
                    'Merchant City': line.substring(116, 129),
                    'Merchant Country Code': line.substring(129, 132),
                    'Merchant Category Code': extract(lineObj, 'Merchant Category Code', 132, 136, 'UN'),
                    'Merchant ZIP Code': extract(lineObj, 'Merchant ZIP Code', 136, 141, 'UN'),
                    'Merchant State/Province Code': line.substring(141, 144),
                    'Requested Payment Service': line.substring(144, 145),
                    'Number of Payment Forms': line.substring(145, 146),
                    'Usage Code': extract(lineObj, 'Usage Code', 146, 147, 'UN'),
                    'Reason Code': extract(lineObj, 'Reason Code', 147, 149, 'UN'),
                    'Settlement Flag': extract(lineObj, 'Settlement Flag', 149, 150, 'UN'),
                    'Authorization Characteristics Indicator': line.substring(150, 151),
                    'Authorization Code': line.substring(151, 157),
                    'POS Terminal Capability': line.substring(157, 158),
                    'Reserved_2': line.substring(158, 159),
                    'Cardholder ID Method': line.substring(159, 160),
                    'Collection-Only Flag': line.substring(160, 161),
                    'POS Entry Mode': extract(lineObj, 'POS Entry Mode', 161, 163, 'UN'),
                    'Central Processing Date (YDDD)': extract(lineObj, 'Central Processing Date (YDDD)', 163, 167, 'UN'),
                    'Reimbursement Attribute': line.substring(167, 168)
                };
            } else if (tcr === '1') {
                description = 'Additional Data (TCR 1)';
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),
                    'Transaction Code Qualifier': line.substring(2, 3),
                    'Transaction Component Sequence Number': line.substring(3, 4),
                    'Business Format Code': line.substring(4, 5),
                    'Token Assurance Method': line.substring(5, 7),
                    'Rate Table ID': line.substring(7, 12),
                    'Scheme Identifier': line.substring(12, 14),
                    'Reserved_1': line.substring(14, 16),
                    'Reserved_2': line.substring(16, 22),
                    'Documentation Indicator': line.substring(22, 23),
                    'Member Message Text': line.substring(23, 73),
                    'Special Condition Indicators': line.substring(73, 75),
                    'Fee Program Indicator': line.substring(75, 78),
                    'Issuer Charge': line.substring(78, 79),
                    'Persistent FX Applied Indicator': line.substring(79, 80),
                    'Card Acceptor ID': line.substring(80, 95),
                    'Terminal ID': line.substring(95, 103),
                    'National Reimbursement Fee': line.substring(103, 115),
                    'Mail/Phone/Electronic Commerce and Payment Indicator': line.substring(115, 116),
                    'Special Chargeback Indicator': line.substring(116, 117),
                    'Conversion Date': line.substring(117, 121),
                    'Additional Token Response Information': line.substring(121, 122),
                    'Reserved_3': line.substring(122, 123),
                    'Acceptance Terminal Indicator': line.substring(123, 124),
                    'Prepaid Card Indicator': line.substring(124, 125),
                    'Service Development Field': line.substring(125, 126),
                    'AVS Response Code': line.substring(126, 127),
                    'Authorization Source Code': line.substring(127, 128),
                    'Purchase Identifier Format': line.substring(128, 129),
                    'Account Selection': line.substring(129, 130),
                    'Installment Payment Count': line.substring(130, 132),
                    'Purchase Identifier': line.substring(132, 157),
                    'Cashback': line.substring(157, 166),
                    'Chip Condition Code': line.substring(166, 167),
                    'POS Environment': line.substring(167, 168)
                };
            } else if (tcr === '2') {
                description = 'National Settlement (TCR 2) - Brazil';
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),
                    'Transaction Code Qualifier': line.substring(2, 3),
                    'Transaction Component Sequence Number': line.substring(3, 4),
                    'Reserved_1': line.substring(4, 16),
                    'Country Code': line.substring(16, 19),
                    'Reserved_2': line.substring(19, 22),
                    'Settlement Type': line.substring(22, 25),
                    'National Reimbursement Fee': line.substring(25, 35),
                    'National Net CPD of Original (YDDD)': line.substring(35, 39),
                    'Installment Payment Count': line.substring(39, 41),
                    'Special Merchant Identifier': line.substring(41, 46),
                    'Special Purchase Identifier': line.substring(46, 47),
                    'Merchant Tax ID Number': line.substring(47, 62),
                    'Reserved_3': line.substring(62, 168)
                };
            } else if (tcr === '5') {
                description = 'Payment Service Data (TCR 5)';
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),
                    'Transaction Code Qualifier': line.substring(2, 3),
                    'Transaction Component Sequence Number': line.substring(3, 4),
                    'Transaction Identifier': line.substring(4, 19),
                    'Authorized Amount': line.substring(19, 31),
                    'Authorization Currency Code': line.substring(31, 34),
                    'Authorization Response Code': line.substring(34, 36),
                    'Validation Code': line.substring(36, 40),
                    'Excluded Transaction Identifier Reason': line.substring(40, 41),
                    'Reserved_1': line.substring(41, 42),
                    'Reserved_2': line.substring(42, 44),
                    'Multiple Clearing Sequence Number': line.substring(44, 46),
                    'Multiple Clearing Sequence Count': line.substring(46, 48),
                    'Market-Specific Authorization Data Indicator': line.substring(48, 49),
                    'Total Authorized Amount': line.substring(49, 61),
                    'Information Indicator': line.substring(61, 62),
                    'Merchant Telephone Number': line.substring(62, 76),
                    'Additional Data Indicator': line.substring(76, 77),
                    'Merchant Volume Indicator': line.substring(77, 79),
                    'Electronic Commerce Goods Indicator': line.substring(79, 81),
                    'Merchant Verification Value': line.substring(81, 91),
                    'Interchange Fee Amount': line.substring(91, 106),
                    'Interchange Fee Sign': line.substring(106, 107),
                    'Source Currency to Base Currency Exchange Rate': line.substring(107, 115),
                    'Base Currency to Destination Currency Exchange Rate': line.substring(115, 123),
                    'Optional Issuer ISA Amount': line.substring(123, 135),
                    'Product ID': line.substring(135, 137),
                    'Program ID': line.substring(137, 143),
                    'Dynamic Currency Conversion (DCC) Indicator': line.substring(143, 144),
                    'Account Type Identification': line.substring(144, 148),
                    'Spend Qualified Indicator': line.substring(148, 149),
                    'PAN Token': line.substring(149, 165),
                    'Reserved_3': line.substring(165, 166),
                    'Account Funding Source': line.substring(166, 167),
                    'CVV2 Result Code': line.substring(167, 168)
                };
            } else if (tcr === '7') {
                description = 'EMV Data (TCR 7)';
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),                // 1-2
                    'TC Qualifier': line.substring(2, 3),                    // 3
                    'TCR Sequence': line.substring(3, 4),                    // 4
                    'Transaction Type': line.substring(4, 6),                // 5-6
                    'Card Seq Num': line.substring(6, 9),                    // 7-9
                    'Term Tx Date': line.substring(9, 15),                   // 10-15
                    'Term Cap Profile': line.substring(15, 21),              // 16-21
                    'Term Ctry Code': line.substring(21, 24),                // 22-24
                    'Term Serial Num': line.substring(24, 32),               // 25-32
                    'Unpred Number': line.substring(32, 40),                 // 33-40
                    'App Tx Counter': line.substring(40, 44),                // 41-44
                    'App I/C Profile': line.substring(44, 48),               // 45-48
                    'Cryptogram': line.substring(48, 64),                    // 49-64
                    'Iss App Dat B2': line.substring(64, 66),                // 65-66
                    'Iss App Dat B3': line.substring(66, 68),                // 67-68
                    'Term Verif Res': line.substring(68, 78),                // 69-78
                    'Iss App Dat B4-7': line.substring(78, 86),              // 79-86
                    'Cryptogram Amt': line.substring(86, 98),                // 87-98
                    'Iss App Dat B8': line.substring(98, 100),               // 99-100
                    'Iss App Dat B9-16': line.substring(100, 116),           // 101-116
                    'Iss App Dat B1': line.substring(116, 118),              // 117-118
                    'Iss App Dat B17': line.substring(118, 120),             // 119-120
                    'Iss App Dat B18-32': line.substring(120, 150),          // 121-150
                    'Form Factor Ind': line.substring(150, 158),             // 151-158
                    'Iss Script 1 Res': line.substring(158, 168)             // 159-168
                };
            } else if (tcr === '9') {
                description = 'Reclassification Data (TCR 9)';
                // Using structure provided by user
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),
                    'Transaction Code Qualifier': line.substring(2, 3),
                    'Transaction Component Sequence Number': line.substring(3, 4),
                    'Destination Identifier': line.substring(4, 10),
                    'Source Identifier': line.substring(10, 16),
                    'Original Transaction Code': line.substring(16, 18),
                    'Original Transaction Code Qualifier': line.substring(18, 19),
                    'Original Transaction Component Sequence Number': line.substring(19, 20),
                    'Source Batch Date (YYDDD)': line.substring(20, 25),
                    'Source Batch Number': line.substring(25, 31),
                    'Item Sequence Number': line.substring(31, 35),
                    'Product Reclassification Reason': line.substring(35, 38),
                    'Settled Product ID': line.substring(38, 40),
                    'Settled Spend Qualified Indicator': line.substring(40, 41),
                    'Settled Account Funding Source': line.substring(41, 42),
                    'Reserved_1': line.substring(42, 68),
                    'Settled Authorization Characteristics Indicator': line.substring(68, 69),
                    'Settled Requested Payment Service': line.substring(69, 70),
                    'Settled Reimbursement Attribute': line.substring(70, 71),
                    'Derived IRF Descriptor': line.substring(71, 87),
                    'Settled IRF Descriptor': line.substring(87, 103),
                    'Payment Service Reclassification Reason': line.substring(103, 106),
                    'Fee Reclassification Reason': line.substring(106, 109),
                    'Merchant Volume Reclassification Reason': line.substring(109, 112),
                    'Submitted Fee Program Indicator': line.substring(112, 115),
                    'Assessed Fee Program Indicator': line.substring(115, 118),
                    'Fee Program Indicator Reclassification Reason': line.substring(118, 121),
                    'MOTO/ECI Reclassification Reason': line.substring(121, 124),
                    'Interchange Fee Amount': line.substring(124, 139),
                    'Interchange Fee Sign': line.substring(139, 140),
                    'Transaction Integrity Fee Reclassification Reason': line.substring(140, 143),
                    'Spend Qualified Indicator Reclassification Reason': line.substring(143, 146),
                    'EDQP Reclassification Reason': line.substring(146, 148),
                    'Account Funding Source Reclassification Reason': line.substring(148, 150),
                    'Reserved_2': line.substring(150, 168)
                };
            } else {
                description = `TCR ${tcr}`;
                parsedFields = {
                    'Raw Data': line.substring(4)
                };
            }
        } else if (tc === '10' || tc === '20') {
            const tcName = tc === '10' ? 'Fee Collection' : 'Funds Disbursement';
            const tcrChar = line.charAt(3);
            tcr = tcrChar;
            tcrInt = parseInt(tcrChar, 10);
            if (isNaN(tcrInt)) tcrInt = 0;

            if (tcrInt <= lastTCR || lastTCR === -1) {
                transactionCount++;
                isTransactionStart = true;
            }
            lastTCR = tcrInt;

            recordType = `${tcName} (TC ${tc}) - TCR ${tcr}`;

            if (tcr === '0') {
                description = 'Outgoing and Incoming Interchange (TCR 0)';
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),
                    'Transaction Code Qualifier': line.substring(2, 3),
                    'Transaction Component Sequence Number': line.substring(3, 4),
                    'Destination Identifier': line.substring(4, 10),
                    'Source Identifier': line.substring(10, 16),
                    'Reason Code': line.substring(16, 20),
                    'Country Code': line.substring(20, 23),
                    'Event Date (MMDD)': line.substring(23, 27),
                    'Account Number': line.substring(27, 43),
                    'Account Number Extension': line.substring(43, 46),
                    'Destination Amount': line.substring(46, 58),
                    'Destination Currency Code': line.substring(58, 61),
                    'Source Amount': line.substring(61, 73),
                    'Source Currency Code': line.substring(73, 76),
                    'Message Text': line.substring(76, 146),
                    'Settlement Flag': line.substring(146, 147),
                    'Transaction Identifier': line.substring(147, 162),
                    'Reserved': line.substring(162, 163),
                    'Central Processing Date (YDDD)': line.substring(163, 167),
                    'Reimbursement Attribute': line.substring(167, 168)
                };
            } else if (tcr === '2') {
                description = 'Brazil National Settlement (TCR 2)';
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),
                    'Transaction Code Qualifier': line.substring(2, 3),
                    'Transaction Component Sequence Number': line.substring(3, 4),
                    'Reserved_1': line.substring(4, 16),
                    'Country Code': line.substring(16, 19),
                    'Reserved_2': line.substring(19, 22),
                    'Settlement Type': line.substring(22, 25),
                    'National Reimbursement Fee': line.substring(25, 35),
                    'Central Processing Date (YDDD)': line.substring(35, 39),
                    'Installment Payment Count': line.substring(39, 41),
                    'Reserved_3': line.substring(41, 168)
                };
            } else {
                description = `${tcName} (TCR ${tcr}) - Unknown`;
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),
                    'Transaction Code Qualifier': line.substring(2, 3),
                    'Transaction Component Sequence Number': line.substring(3, 4),
                    'Raw Data': line.substring(4)
                };
            }
        } else if (tc === '44') {
            // Pos 4 (Index 3) is TCR Sequence Number
            const tcrChar = line.charAt(3);
            tcr = tcrChar;
            tcrInt = parseInt(tcrChar, 10);
            if (isNaN(tcrInt)) tcrInt = 0;

            if (tcr === '0') {
                const batchDispositionCode = line.substring(35, 36); // Position 36 is index 35
                description = `Collection Batch Acknowledgment (TCR 0) - Type ${batchDispositionCode}`;

                if (batchDispositionCode === 'A' || batchDispositionCode === 'X') {
                    // X has slightly different reserved field name but structure is identical for parsing
                    parsedFields = {
                        'Transaction Code': line.substring(0, 2),
                        'Transaction Code Qualifier': line.substring(2, 3),
                        'Transaction Component Sequence Number': line.substring(3, 4),
                        'Destination Identifier': line.substring(4, 10),
                        'Source Identifier': line.substring(10, 16),
                        'Edit Package Batch Date (YYDDD)': line.substring(16, 21),
                        'Edit Package Batch Number': line.substring(21, 27),
                        'Collection Date': line.substring(27, 32),
                        'Collection Window Number': line.substring(32, 35),
                        'Batch Disposition Code': line.substring(35, 36),
                        'Summary Type Code': line.substring(36, 37),
                        'Currency Code': line.substring(37, 40),
                        'Settlement Flag': line.substring(40, 41),
                        'Reserved_1': line.substring(41, 42),
                        'Total Transaction Component Records': line.substring(42, 57),
                        'Total Transactions': line.substring(57, 72),
                        'Gross Amount': line.substring(72, 87),
                        'Reserved_2': line.substring(87, 137),
                        'BASE II Unique File ID': line.substring(137, 167),
                        'Reimbursement Attribute': line.substring(167, 168)
                    };
                } else if (batchDispositionCode === 'R') {
                    parsedFields = {
                        'Transaction Code': line.substring(0, 2),
                        'Transaction Code Qualifier': line.substring(2, 3),
                        'Transaction Component Sequence Number': line.substring(3, 4),
                        'Destination Identifier': line.substring(4, 10),
                        'Source Identifier': line.substring(10, 16),
                        'Edit Package Batch Date (YYDDD)': line.substring(16, 21),
                        'Edit Package Batch Number': line.substring(21, 27),
                        'Collection Date': line.substring(27, 32),
                        'Collection Window Number': line.substring(32, 35),
                        'Batch Disposition Code': line.substring(35, 36),
                        'Reject Reason Code': line.substring(36, 39),
                        'Reserved_1': line.substring(39, 137),
                        'BASE II Unique File ID': line.substring(137, 167),
                        'Reimbursement Attribute': line.substring(167, 168)
                    };
                } else {
                    description = `Collection Batch Acknowledgment (TCR 0) - Unknown Type ${batchDispositionCode}`;
                    parsedFields = {
                        'Raw Data': line.substring(4)
                    };
                }

            } else {
                // TCR 1-8
                const seq = parseInt(tcr);
                if (seq >= 1 && seq <= 8) {
                    description = `Collection Batch Acknowledgment (TCR ${tcr})`;
                    parsedFields = {
                        'Transaction Code': line.substring(0, 2),
                        'Transaction Code Qualifier': line.substring(2, 3),
                        'Transaction Component Sequence Number': line.substring(3, 4),
                        'Reserved_1': line.substring(4, 16),
                        // Group 1
                        'Transaction Code Being Summarized 1': line.substring(16, 18),
                        'Transaction Code Qualifier 1': line.substring(18, 19),
                        'Transaction Count 1': line.substring(19, 34),
                        'Settlement Amount 1': line.substring(34, 49),
                        // Group 2
                        'Transaction Code Being Summarized 2': line.substring(49, 51),
                        'Transaction Code Qualifier 2': line.substring(51, 52),
                        'Transaction Count 2': line.substring(52, 67),
                        'Settlement Amount 2': line.substring(67, 82),
                        // Group 3
                        'Transaction Code Being Summarized 3': line.substring(82, 84),
                        'Transaction Code Qualifier 3': line.substring(84, 85),
                        'Transaction Count 3': line.substring(85, 100),
                        'Settlement Amount 3': line.substring(100, 115),
                        // Group 4
                        'Transaction Code Being Summarized 4': line.substring(115, 117),
                        'Transaction Code Qualifier 4': line.substring(117, 118),
                        'Transaction Count 4': line.substring(118, 133),
                        'Settlement Amount 4': line.substring(133, 148),

                        'Reserved_2': line.substring(148, 168)
                    };
                } else {
                    description = `Collection Batch Acknowledgment (TCR ${tcr}) - Unknown`;
                    parsedFields = {
                        'Raw Data': line.substring(4)
                    };
                }
            }
        } else if (['01', '02', '03'].includes(tc)) {
            const typeMap = {
                '01': 'Returned Credit (TC 01)',
                '02': 'Returned Debit (TC 02)',
                '03': 'Returned Non-Fin (TC 03)'
            };

            // Pos 4 (Index 3) is TCR Sequence Number
            const tcrChar = line.charAt(3);
            tcr = tcrChar;
            tcrInt = parseInt(tcrChar, 10);
            if (isNaN(tcrInt)) tcrInt = 0;

            // Grouping logic
            if (tcrInt <= lastTCR || lastTCR === -1) {
                transactionCount++;
                isTransactionStart = true;
            }
            lastTCR = tcrInt;

            recordType = `${typeMap[tc]} - TCR ${tcr}`;

            if (tcr === '9') {
                description = 'Return Data (TCR 9)';
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),                // 1-2
                    'TC Qualifier': line.substring(2, 3),                    // 3
                    'TCR Sequence': line.substring(3, 4),                    // 4
                    'Dest ID': line.substring(4, 10),                        // 5-10 (6)
                    'Source ID': line.substring(10, 16),                     // 11-16 (6)
                    'Orig Tx Code': line.substring(16, 18),                  // 17-18 (2)
                    'Orig TC Qual': line.substring(18, 19),                  // 19
                    'Orig TCR Seq': line.substring(19, 20),                  // 20
                    'Source Batch Date': line.substring(20, 25),             // 21-25 (5)
                    'Source Batch Num': line.substring(25, 31),              // 26-31 (6)
                    'Item Seq Num': line.substring(31, 35),                  // 32-35 (4)
                    'Reason Code 1': line.substring(35, 38),                 // 36-38 (3)
                    'Orig Src Amt': line.substring(38, 50),                  // 39-50 (12)
                    'Orig Src Curr': line.substring(50, 53),                 // 51-53 (3)
                    'Orig Settl Flag': line.substring(53, 54),               // 54
                    'CRS Return Flag': line.substring(54, 55),               // 55
                    'Reason Code 2': line.substring(55, 58),                 // 56-58 (3)
                    'Reason Code 3': line.substring(58, 61),                 // 59-61 (3)
                    'Reason Code 4': line.substring(61, 64),                 // 62-64 (3)
                    'Reason Code 5': line.substring(64, 67),                 // 65-67 (3)
                    'Reserved': line.substring(67, 168)                      // 68-168 (101)
                };
            } else {
                description = `Returned TCR ${tcr}`;
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),
                    'TC Qualifier': line.substring(2, 3),
                    'TCR Sequence': line.substring(3, 4),
                    'Contents': line.substring(4, 168) // 5-168
                };
            }

        } else if (tc === '47') {
            // Pos 6 (Index 5) is TCR Sequence Number for TC 47 - OLD SPEC
            // OBSERVED FILE STRUCTURE:
            // 1-2 TC (47)
            // 3 Qual (Index 2)
            // 4 Seq (Index 3)
            // 5-10 Dest ID (Index 4-9)
            // ... Match typical header, NO HASH.

            const tcrChar = line.charAt(3); // Adjusted to Index 3
            tcr = tcrChar;
            tcrInt = parseInt(tcrChar, 10);
            if (isNaN(tcrInt)) tcrInt = 0;

            if (tcrInt <= lastTCR || lastTCR === -1) {
                transactionCount++;
                isTransactionStart = true;
                // Reset group tracking on new transaction
                lastTC46Group = '';
                lastTC46Subgroup = '';
            }
            lastTCR = tcrInt;

            recordType = 'Report Generation Record (TC 47)';

            // The 'TCR 0' layout seems to apply to all TC 47 records in the provided file,
            // regardless of the sequence number.
            description = `Report Generation Record (Seq ${tcrInt})`;
            parsedFields = {
                'Transaction Code': line.substring(0, 2),
                // 'Record Hash Total': line.substring(2, 4), // REMOVED based on file analysis
                'Transaction Code Qualifier': line.substring(2, 3),
                'Transaction Component Sequence Number': line.substring(3, 4),
                'Destination Identifier': line.substring(4, 10),
                'Source Identifier': line.substring(10, 16),
                'Text': line.substring(16, 147), // Adjusted indices (-2)
                'Reserved': line.substring(147, 167),
                'Reimbursement Attribute': line.substring(167, 168)
            };

        } else if (tc === '46') {
            // TC 46 Client Settlement Data Record
            const tcrChar = line.charAt(3); // Position 4
            tcr = tcrChar;
            tcrInt = parseInt(tcrChar, 10);
            if (isNaN(tcrInt)) tcrInt = 0;

            if (tcrInt <= lastTCR || lastTCR === -1) {
                transactionCount++;
                isTransactionStart = true;
                // Reset group tracking on new transaction
                lastTC46Group = '';
                lastTC46Subgroup = '';
            }
            lastTCR = tcrInt;

            recordType = 'Client Settlement Data Record (TC 46)';

            // Extract Report Group and Subgroup (positions 59 and 60 -> indices 58 and 59)
            // Note: These are only reliably present in TCR 0. For other TCRs, we rely on state.
            let reportGroup = '';
            let reportSubgroup = '';

            if (tcr === '0') {
                reportGroup = line.substring(58, 59);
                reportSubgroup = line.substring(59, 60);

                // Save state for subsequent TCRs
                lastTC46Group = reportGroup;
                lastTC46Subgroup = reportSubgroup;

                if (reportGroup === 'V' && reportSubgroup === '1') {
                    description = 'Client Settlement Data (TCR 0) - Group V Subgroup 1';
                    parsedFields = {
                        'Transaction Code': line.substring(0, 2),
                        'Transaction Code Qualifier': line.substring(2, 3),
                        'Transaction Component Sequence Number': line.substring(3, 4),
                        'Destination Identifier': line.substring(4, 10),
                        'Source Identifier': line.substring(10, 16),
                        'Reporting for SRE Identifier': line.substring(16, 26),
                        'Settlement Service Identifier': line.substring(26, 29),
                        'Report Date': line.substring(29, 36),
                        'SRE Level Number': line.substring(36, 37),
                        'Last Change Date': line.substring(37, 44),
                        'Reserved_1': line.substring(44, 58),
                        'Report Group': line.substring(58, 59),
                        'Report Subgroup': line.substring(59, 60),
                        'Report Identification Number': line.substring(60, 63),
                        'Report Identification Suffix': line.substring(63, 65),
                        'Subordinate SRE Identifier': line.substring(65, 75),
                        'Subordinate SRE Name': line.substring(75, 90),
                        'Funds Transfer Indicator': line.substring(90, 91),
                        'Clearing Entity Identifier Type': line.substring(91, 92),
                        'Clearing Entity Identifier 1': line.substring(92, 110),
                        'Clearing Entity Identifier 2': line.substring(110, 128),
                        'Processor Specified Indicator': line.substring(128, 129),
                        'Processor Identifier': line.substring(129, 139),
                        'Network Specified Indicator': line.substring(139, 140),
                        'Network Identifier': line.substring(140, 144),
                        'Settlement Currency': line.substring(144, 147),
                        'Transaction Currency (Acquirer)': line.substring(147, 150),
                        'Transaction Currency (Issuer)': line.substring(150, 153),
                        'Reserved_2': line.substring(153, 167),
                        'Reimbursement Attribute': line.substring(167, 168)
                    };
                } else if (reportGroup === 'V' && reportSubgroup === '9') {
                    description = 'Client Settlement Data (TCR 0) - Group V Subgroup 9';
                    parsedFields = {
                        'Transaction Code': line.substring(0, 2),
                        'Transaction Code Qualifier': line.substring(2, 3),
                        'Transaction Component Sequence Number': line.substring(3, 4),
                        'Destination Identifier': line.substring(4, 10),
                        'Source Identifier': line.substring(10, 16),
                        'Reporting for SRE Identifier': line.substring(16, 26),
                        'Rollup to SRE Identifier': line.substring(26, 36),
                        'Funds Transfer SRE Identifier': line.substring(36, 46),
                        'Settlement Service Identifier': line.substring(46, 49),
                        'Settlement Currency Code': line.substring(49, 52),
                        'Business Mode': line.substring(52, 53),
                        'No Data Indicator': line.substring(53, 54),
                        'Reserved_1': line.substring(54, 58),
                        'Report Group': line.substring(58, 59),
                        'Report Subgroup': line.substring(59, 60),
                        'Report Identification Number': line.substring(60, 63),
                        'Report Identification Suffix': line.substring(63, 65),
                        'Settlement Date': line.substring(65, 72),
                        'Report Date': line.substring(72, 79),
                        'From Date': line.substring(79, 86),
                        'To Date': line.substring(86, 93),
                        'Payment Mode/Settlement Type': line.substring(93, 96),
                        'Business Transaction Type': line.substring(96, 99),
                        'Business Transaction Cycle': line.substring(99, 100),
                        'Twice Payment Number': line.substring(100, 101),
                        'Original Date/Processing Date': line.substring(101, 108),
                        'Summary Level': line.substring(108, 110),
                        'Reversal Indicator': line.substring(110, 111),
                        'Install Payment Indicator': line.substring(111, 112),
                        'Reserved_2': line.substring(112, 167),
                        'Reimbursement Attribute': line.substring(167, 168)
                    };
                } else {
                    description = `Client Settlement Data (TCR ${tcr}) - Group ${reportGroup} Subgroup ${reportSubgroup}`;
                    parsedFields = {
                        'Transaction Code': line.substring(0, 2),
                        'Report Group': reportGroup,
                        'Report Subgroup': reportSubgroup,
                        'Raw Data': line.substring(4)
                    };
                }
            } else if (tcr === '1') {
                if (lastTC46Group === 'V' && lastTC46Subgroup === '9') {
                    description = 'Client Settlement Data (TCR 1) - Group V Subgroup 9';
                    parsedFields = {
                        'Transaction Code': line.substring(0, 2),
                        'Transaction Code Qualifier': line.substring(2, 3),
                        'Transaction Component Sequence Number': line.substring(3, 4),
                        'First Count': line.substring(4, 19),
                        'Second Count': line.substring(19, 34),
                        'First Amount': line.substring(34, 49),
                        'First Amount Sign': line.substring(49, 51),
                        'Second Amount': line.substring(51, 66),
                        'Second Amount Sign': line.substring(66, 68),
                        'Third Amount': line.substring(68, 83),
                        'Third Amount Sign': line.substring(83, 85),
                        'Fourth Amount': line.substring(85, 100),
                        'Fourth Amount Sign': line.substring(100, 102),
                        'Fifth Amount': line.substring(102, 117),
                        'Fifth Amount Sign': line.substring(117, 119),
                        'Sixth Amount': line.substring(119, 134),
                        'Sixth Amount Sign': line.substring(134, 136),
                        'Reserved': line.substring(136, 168)
                    };
                } else {
                    description = `Client Settlement Data (TCR ${tcr}) - Group ${lastTC46Group} Subgroup ${lastTC46Subgroup}`;
                    parsedFields = {
                        'Transaction Code': line.substring(0, 2),
                        'Raw Data': line.substring(4)
                    };
                }
            } else {
                description = `Client Settlement Data (TCR ${tcr}) - Group ${lastTC46Group} Subgroup ${lastTC46Subgroup}`;
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),
                    'Report Group': lastTC46Group,
                    'Report Subgroup': lastTC46Subgroup,
                    'Raw Data': line.substring(4)
                };
            }

        } else {
            recordType = `Unknown TC (${tc})`;
            lastTCR = -1;
        }

        return {
            id: index + 1,
            raw: line,
            tc,
            tcr,
            type: recordType,
            description,
            parsedFields,
            transactionId: (['05', '06', '15', '16', '25', '26', '04', '01', '02', '03', '10', '20'].includes(tc)) ? transactionCount : null,
            isTransactionStart
        };
    });

    // File level validation: Sum all Source Amount that are not TC91 or TC92 and compare to TC92
    let calculatedTotalSourceAmount = 0;
    let fileTrailerSourceAmount = null;
    let tc92Line = 'File Level';

    records.forEach(rec => {
        if (rec.tc === '92') {
            const amtStr = rec.parsedFields['Source Amount'];
            if (amtStr !== undefined && amtStr.trim() !== '') {
                fileTrailerSourceAmount = parseInt(amtStr, 10);
                tc92Line = rec.id;
            }
        } else if (rec.tc !== '91') {
            const amtStr = rec.parsedFields['Source Amount'];
            if (amtStr !== undefined && amtStr.trim() !== '' && !isNaN(parseInt(amtStr, 10))) {
                calculatedTotalSourceAmount += parseInt(amtStr, 10);
            }
        }
    });

    if (fileTrailerSourceAmount !== null && calculatedTotalSourceAmount !== fileTrailerSourceAmount) {
        errors.unshift({
            line: tc92Line,
            field: 'Source Amount Total Verification',
            message: `CRITICAL FILE ERROR: The sum of all Transaction Source Amounts (${calculatedTotalSourceAmount}) does NOT equal the File Trailer (TC 92) Source Amount (${fileTrailerSourceAmount}).`
        });
    } else if (fileTrailerSourceAmount !== null && calculatedTotalSourceAmount === fileTrailerSourceAmount) {
        errors.unshift({
            line: tc92Line,
            field: 'Source Amount Total Verification',
            message: `SUCCESS: The sum of all Transaction Source Amounts (${calculatedTotalSourceAmount}) perfectly matches the File Trailer (TC 92) Source Amount.`
        });
    }

    return {
        message: `Parsed ${records.length} records.`,
        records: records,
        errors: errors
    };
};

// Keeping getHexDump if needed for other things, but DecodedView might not use it.
export const getHexDump = (buffer, limit = 1024) => {
    const view = new DataView(buffer);
    const length = Math.min(buffer.byteLength, limit);
    const rows = [];

    for (let i = 0; i < length; i += 16) {
        const chunk = [];
        const ascii = [];
        for (let j = 0; j < 16; j++) {
            if (i + j < length) {
                const byte = view.getUint8(i + j);
                chunk.push(byte.toString(16).padStart(2, '0').toUpperCase());
                ascii.push(byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.');
            } else {
                chunk.push('  ');
            }
        }
        rows.push({
            offset: i.toString(16).padStart(8, '0').toUpperCase(),
            hex: chunk.join(' '),
            ascii: ascii.join('')
        });
    }

    return rows;
};
