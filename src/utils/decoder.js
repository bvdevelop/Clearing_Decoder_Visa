// Parsing logic for VISA Clearing Files (CTF/ITF)
// Structure: Text-based, 168 characters per line initially, delimited by CRLF.
// Total line length including CRLF might be 170.

export const parseVisaFile = (buffer) => {
    const textDecoder = new TextDecoder('ascii');
    const fullText = textDecoder.decode(buffer);

    // Split by newlines
    const lines = fullText.split(/\r?\n/).filter(line => line.length > 0);
    const errors = [];

    let transactionCount = 0;
    let lastTCR = -1;

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

    const records = lines.map((line, index) => {
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
        } else if (['05', '06', '15', '16', '25', '26'].includes(tc)) {
            // Draft Data Transactions (TC 05, 06, 15, 16, 25, 26)
            // They all share the same TCR structure (0, 1, 2, 5, 7, etc.)
            const draftTypeMap = {
                '05': 'Sales Draft (TC 05)',
                '06': 'Credit Voucher (TC 06)',
                '15': 'Dispute Fin. Draft (TC 15)',
                '16': 'Dispute Fin. Credit (TC 16)',
                '25': 'Reversal Draft (TC 25)',
                '26': 'Reversal Credit (TC 26)'
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
                    'Transaction Code': extract(lineObj, 'Transaction Code', 0, 2, 'UN'),
                    'TC Qualifier': extract(lineObj, 'TC Qualifier', 2, 3, 'UN'),
                    'TCR Sequence': extract(lineObj, 'TCR Sequence', 3, 4, 'UN'),
                    'Account Number': extract(lineObj, 'Account Number', 4, 20, 'UN'),
                    'Account Number Ext': extract(lineObj, 'Account Number Ext', 20, 23, 'UN'),
                    'Floor Limit Ind': line.substring(23, 24),
                    'CRB/Exception': line.substring(24, 25),
                    'Reserved_1': line.substring(25, 26),
                    'Acquirer Ref Num': extract(lineObj, 'Acquirer Ref Num', 26, 49, 'UN'),
                    'Acquirer Bus ID': extract(lineObj, 'Acquirer Bus ID', 49, 57, 'UN'),
                    'Purchase Date': extract(lineObj, 'Purchase Date', 57, 61, 'UN'),
                    'Destination Amt': extract(lineObj, 'Destination Amt', 61, 73, 'UN'),
                    'Dest Curr Code': line.substring(73, 76),                   // AN per user spec
                    'Source Amt': extract(lineObj, 'Source Amt', 76, 88, 'UN'),
                    'Source Curr Code': line.substring(88, 91),                 // AN (Safe default)
                    'Merchant Name': line.substring(91, 116),
                    'Merchant City': line.substring(116, 129),
                    'Merchant Country': line.substring(129, 132),
                    'Merchant Category': extract(lineObj, 'Merchant Category', 132, 136, 'UN'),
                    'Merchant ZIP': extract(lineObj, 'Merchant ZIP', 136, 141, 'UN'),
                    'Merchant State': line.substring(141, 144),
                    'Req Pay Service': line.substring(144, 145),
                    'Num Pay Forms': line.substring(145, 146),
                    'Usage Code': extract(lineObj, 'Usage Code', 146, 147, 'UN'),
                    'Reason Code': extract(lineObj, 'Reason Code', 147, 149, 'UN'),
                    'Settlement Flag': extract(lineObj, 'Settlement Flag', 149, 150, 'UN'),
                    'Auth Char Ind': line.substring(150, 151),
                    'Auth Code': line.substring(151, 157),
                    'POS Terminal Cap': line.substring(157, 158),
                    'Reserved_2': line.substring(158, 159),
                    'Cardholder ID': line.substring(159, 160),
                    'Collection Only': line.substring(160, 161),
                    'POS Entry Mode': extract(lineObj, 'POS Entry Mode', 161, 163, 'UN'),
                    'Central Proc Date': extract(lineObj, 'Central Proc Date', 163, 167, 'UN'),
                    'Reimbursement Attr': line.substring(167, 168)
                };
            } else if (tcr === '1') {
                description = 'Additional Data (TCR 1)';
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),                // 1-2
                    'TC Qualifier': line.substring(2, 3),                    // 3
                    'TCR Sequence': line.substring(3, 4),                    // 4
                    'Business Fmt Code': line.substring(4, 5),               // 5
                    'Token Assur Method': line.substring(5, 7),              // 6-7
                    'Rate Table ID': line.substring(7, 12),                  // 8-12
                    'Scheme ID': line.substring(12, 14),                     // 13-14
                    'Reserved_1': line.substring(14, 22),                    // 15-22 (8 chars: 15-16 res, 17-22 res)
                    'Doc Indicator': line.substring(22, 23),                 // 23
                    'Member Msg Text': line.substring(23, 73),               // 24-73
                    'Special Cond Ind': line.substring(73, 75),              // 74-75
                    'Fee Prog Ind': line.substring(75, 78),                  // 76-78
                    'Issuer Charge': line.substring(78, 79),                 // 79
                    'Persist FX Ind': line.substring(79, 80),                // 80
                    'Card Acceptor ID': line.substring(80, 95),              // 81-95
                    'Terminal ID': line.substring(95, 103),                  // 96-103
                    'Nat Reimb Fee': line.substring(103, 115),               // 104-115
                    'Mail/Phone/E-Comm': line.substring(115, 116),           // 116
                    'Special Chgbk Ind': line.substring(116, 117),           // 117
                    'Conversion Date': line.substring(117, 121),             // 118-121
                    'Addl Token Resp': line.substring(121, 122),             // 122
                    'Reserved_2': line.substring(122, 123),                  // 123
                    'Accept Term Ind': line.substring(123, 124),             // 124
                    'Prepaid Card Ind': line.substring(124, 125),            // 125
                    'Svc Dev Field': line.substring(125, 126),               // 126
                    'AVS Resp Code': line.substring(126, 127),               // 127
                    'Auth Source Code': line.substring(127, 128),            // 128
                    'Purch ID Fmt': line.substring(128, 129),                // 129
                    'Acct Selection': line.substring(129, 130),              // 130
                    'Installment Count': line.substring(130, 132),           // 131-132
                    'Purchase ID': line.substring(132, 157),                 // 133-157
                    'Cashback': line.substring(157, 166),                    // 158-166
                    'Chip Cond Code': line.substring(166, 167),              // 167
                    'POS Env': line.substring(167, 168)                      // 168
                };
            } else if (tcr === '2') {
                description = 'National Settlement (TCR 2) - Brazil';
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),                // 1-2
                    'TC Qualifier': line.substring(2, 3),                    // 3
                    'TCR Sequence': line.substring(3, 4),                    // 4
                    'Reserved_1': line.substring(4, 16),                     // 5-16 (12)
                    'Country Code': line.substring(16, 19),                  // 17-19 (3)
                    'Reserved_2': line.substring(19, 22),                    // 20-22 (3)
                    'Settlement Type': line.substring(22, 25),               // 23-25 (3)
                    'Nat Reimb Fee': line.substring(25, 35),                 // 26-35 (10)
                    'Nat Net CPD': line.substring(35, 39),                   // 36-39 (4)
                    'Installment Count': line.substring(39, 41),             // 40-41 (2)
                    'Special Merch ID': line.substring(41, 46),              // 42-46 (5)
                    'Special Purch ID': line.substring(46, 47),              // 47 (1)
                    'Merch Tax ID': line.substring(47, 62),                  // 48-62 (15)
                    'Reserved_3': line.substring(62, 168)                    // 63-168 (106)
                };
            } else if (tcr === '5') {
                description = 'Payment Service Data (TCR 5)';
                parsedFields = {
                    'Transaction Code': line.substring(0, 2),                // 1-2
                    'TC Qualifier': line.substring(2, 3),                    // 3
                    'TCR Sequence': line.substring(3, 4),                    // 4
                    'Transaction ID': line.substring(4, 19),                 // 5-19
                    'Authorized Amt': line.substring(19, 31),                // 20-31
                    'Auth Curr Code': line.substring(31, 34),                // 32-34
                    'Auth Resp Code': line.substring(34, 36),                // 35-36
                    'Validation Code': line.substring(36, 40),               // 37-40
                    'Excl Tran ID Rsn': line.substring(40, 41),              // 41
                    'Reserved_1': line.substring(41, 44),                    // 42-44 (42 res, 43-44 res)
                    'Mult Clr Seq Num': line.substring(44, 46),              // 45-46
                    'Mult Clr Seq Cnt': line.substring(46, 48),              // 47-48
                    'Mkt Auth Data Ind': line.substring(48, 49),             // 49
                    'Tot Auth Amt': line.substring(49, 61),                  // 50-61
                    'Info Ind': line.substring(61, 62),                      // 62
                    'Merch Tel Num': line.substring(62, 76),                 // 63-76
                    'Addl Data Ind': line.substring(76, 77),                 // 77
                    'Merch Vol Ind': line.substring(77, 79),                 // 78-79
                    'E-Comm Goods Ind': line.substring(79, 81),              // 80-81
                    'Merch Verif Val': line.substring(81, 91),               // 82-91
                    'Interchange Fee': line.substring(91, 106),              // 92-106
                    'Fee Sign': line.substring(106, 107),                    // 107
                    'Src->Base Rate': line.substring(107, 115),              // 108-115
                    'Base->Dest Rate': line.substring(115, 123),             // 116-123
                    'Opt Issuer ISA': line.substring(123, 135),              // 124-135
                    'Product ID': line.substring(135, 137),                  // 136-137
                    'Program ID': line.substring(137, 143),                  // 138-143
                    'DCC Ind': line.substring(143, 144),                     // 144
                    'Acct Type ID': line.substring(144, 148),                // 145-148
                    'Spend Qual Ind': line.substring(148, 149),              // 149
                    'PAN Token': line.substring(149, 165),                   // 150-165
                    'Reserved_2': line.substring(165, 166),                  // 166
                    'Acct Fund Src': line.substring(166, 167),               // 167
                    'CVV2 Result': line.substring(167, 168)                  // 168
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
            } else {
                description = `TCR ${tcr}`;
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
            transactionId: (['05', '06', '15', '16', '25', '26', '01', '02', '03'].includes(tc)) ? transactionCount : null,
            isTransactionStart
        };
    });

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
