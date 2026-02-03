/**
 * PDO Simulator - Proxy Directory Operator
 * 
 * Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/role-of-the-proxy-directory-operator-pdo
 * 
 * PDOs manage proxy-to-account mappings:
 * - PayNow (Singapore): MOBI, NRIC, UEN
 * - PromptPay (Thailand): MOBI, NIDN
 * - DuitNow (Malaysia): MOBI, NRIC, BIZN, PASS
 */

import express from 'express';
import cors from 'cors';
import pino from 'pino';

const config = {
    port: parseInt(process.env.PORT || '3000'),
    pdoId: process.env.PDO_ID || 'pdo-sg',
    pdoName: process.env.PDO_NAME || 'PayNow Directory Singapore',
    pdoCountry: process.env.PDO_COUNTRY || 'SG',
    proxyTypes: JSON.parse(process.env.PROXY_TYPES || '["MOBI","NRIC","UEN"]'),
    nexusGatewayUrl: process.env.NEXUS_GATEWAY_URL || 'http://localhost:8000',
};

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: { target: 'pino-pretty', options: { colorize: true } }
});

const app = express();
app.use(cors());
app.use(express.json());

// Demo proxy registrations
const proxyDatabase = new Map([
    // Singapore
    ['SG:MOBI:+6591234567', {
        creditorName: 'John Tan Wei Ming',
        creditorNameMasked: 'Jo** T*n W*i M*ng',
        accountNumber: '1234567890',
        bankBic: 'DBSSSGSG',
        bankName: 'DBS Bank',
    }],
    ['SG:MOBI:+6598765432', {
        creditorName: 'Mary Lim Siew Hwa',
        creditorNameMasked: 'Ma** L*m S*ew H*a',
        accountNumber: '0987654321',
        bankBic: 'OCBCSGSG',
        bankName: 'OCBC Bank',
    }],
    ['SG:NRIC:S1234567A', {
        creditorName: 'Alice Wong Mei Ling',
        creditorNameMasked: 'Al*ce W*ng M*i L*ng',
        accountNumber: '5555666677',
        bankBic: 'DBSSSGSG',
        bankName: 'DBS Bank',
    }],
    // Thailand
    ['TH:MOBI:+66812345678', {
        creditorName: 'Somchai Jaidee',
        creditorNameMasked: 'So***ai Ja***e',
        accountNumber: 'TH123456789',
        bankBic: 'KASITHBK',
        bankName: 'Kasikornbank',
    }],
    // Malaysia
    ['MY:MOBI:+60123456789', {
        creditorName: 'Ahmad bin Abdullah',
        creditorNameMasked: 'Ah*** b*n Ab****ah',
        accountNumber: 'MY12345678901234',
        bankBic: 'MABORKKL',
        bankName: 'Maybank',
    }],
]);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        pdoId: config.pdoId,
        pdoName: config.pdoName,
        country: config.pdoCountry,
        supportedProxyTypes: config.proxyTypes,
    });
});

/**
 * Get supported proxy types
 * Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/address-types-and-inputs/address-types
 */
app.get('/proxy-types', (req, res) => {
    res.json({
        pdoId: config.pdoId,
        country: config.pdoCountry,
        proxyTypes: config.proxyTypes,
    });
});

/**
 * Resolve proxy to account details (acmt.023 → acmt.024)
 * Reference: https://docs.nexusglobalpayments.org/addressing-and-proxy-resolution/proxy-and-account-resolution-process
 * 
 * Steps 7-9 in the payment flow
 */
app.post('/resolve', (req, res) => {
    const { proxyType, proxyValue, country } = req.body;

    const key = `${country || config.pdoCountry}:${proxyType}:${proxyValue}`;
    logger.info({ key }, 'Resolving proxy');

    const registration = proxyDatabase.get(key);

    // Trigger values for unhappy flow testing
    // Reference: docs/UNHAPPY_FLOWS.md
    const triggerValues = {
        '+66999999999': { error: 'BE23', message: 'Account/Proxy Invalid - Not registered in PDO' },
        '+60999999999': { error: 'AC04', message: 'Account Closed' },
        '+62999999999': { error: 'RR04', message: 'Regulatory/AML Block' },
    };

    // Check for trigger values first
    if (triggerValues[proxyValue]) {
        const trigger = triggerValues[proxyValue];
        logger.warn({ key, trigger }, 'Trigger value detected - returning error');
        return res.status(422).json({
            resolved: false,
            error: trigger.error,
            statusReasonCode: trigger.error,  // ISO 20022 ExternalStatusReason1Code
            message: trigger.message,
            proxyType,
            proxyValue,
        });
    }

    if (!registration) {
        logger.warn({ key }, 'Proxy not found');
        return res.status(404).json({
            resolved: false,
            error: 'BE23',  // ISO 20022: Account/Proxy Invalid
            statusReasonCode: 'BE23',
            message: `No account registered for ${proxyType}:${proxyValue}`,
            proxyType,
            proxyValue,
        });
    }

    // Return acmt.024 equivalent response
    // Reference: https://docs.nexusglobalpayments.org/messaging-and-translation/message-acmt.024-account-identification-and-confirmation
    res.json({
        resolved: true,
        proxyType,
        proxyValue,
        creditorName: registration.creditorName,
        creditorNameMasked: registration.creditorNameMasked,
        accountNumber: registration.accountNumber,
        bankBic: registration.bankBic,
        bankName: registration.bankName,
    });
});

/**
 * Add a proxy registration (for sandbox testing)
 */
app.post('/registrations', (req, res) => {
    const { proxyType, proxyValue, creditorName, accountNumber, bankBic, bankName } = req.body;

    const key = `${config.pdoCountry}:${proxyType}:${proxyValue}`;

    // Mask creditor name (simple masking for demo)
    const words = creditorName.split(' ');
    const maskedName = words.map(word =>
        word.length <= 2 ? word : word[0] + word[1] + '*'.repeat(word.length - 2)
    ).join(' ');

    proxyDatabase.set(key, {
        creditorName,
        creditorNameMasked: maskedName,
        accountNumber,
        bankBic,
        bankName,
    });

    logger.info({ key }, 'Proxy registered');

    res.status(201).json({
        registered: true,
        proxyType,
        proxyValue,
        country: config.pdoCountry,
    });
});

app.listen(config.port, () => {
    logger.info({
        port: config.port,
        pdoId: config.pdoId,
        pdoName: config.pdoName,
        country: config.pdoCountry,
        registrations: proxyDatabase.size,
    }, 'PDO Simulator started');
});
