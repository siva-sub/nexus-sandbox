/**
 * Interactive Demo Page - Full Payment Flow Demo
 * 
 * Follows the actual Nexus reference implementation flow:
 * 1. Source country selection
 * 2. Amount specification (SOURCE or DESTINATION)
 * 3. Destination country + proxy resolution
 * 4. Quote selection from list (Source PSP selects)
 * 5. Confirmation and payment initiation
 * 6. Lifecycle trace display
 * 
 * Validated via NotebookLM query on Feb 4, 2026:
 * - Source PSP requests quotes via GET /quotes
 * - Nexus returns list from pre-submitted FXP rates
 * - Source PSP selects preferred quote
 * - Constructs pacs.008 with Quote ID
 */

import { useState, useCallback, useEffect } from "react";
import { generateUUID } from "../utils/uuid";
import { useNavigate } from "react-router-dom";
import {
    Title,
    Card,
    Stack,
    Group,
    Text,
    Button,
    Select,
    SegmentedControl,
    Badge,
    Box,
    SimpleGrid,
    Alert,
    Code,
    Anchor,
    Breadcrumbs,
    useMantineTheme,
    Stepper,
    NumberInput,
    Autocomplete,
    Radio,
    Progress,
    Timeline,
    Divider,
    ScrollArea,
    Accordion,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
    IconPlayerPlay,
    IconCheck,
    IconX,
    IconArrowsExchange,
    IconInfoCircle,
    IconRefresh,
    IconSend,
    IconUser,
    IconWorld,
    IconReceipt,
    IconPhone,
    IconAlertTriangle,
    IconCode,
} from "@tabler/icons-react";
import {
    getCountries,
    getQuotes,
    getPreTransactionDisclosure,
    resolveProxy,
    searchProxies,
    submitPacs008,
    confirmSenderApproval,
    getIntermediaryAgents
} from "../services/api";
import { ActorRegistrationModal } from "../components/ActorRegistrationModal";
import { FeeCard } from "../components/payment";
import type { Quote, FeeBreakdown, Country } from "../types";

// ============================================================================
// CONSTANTS
// ============================================================================

// Default PSP BICs by country (for demo fallback when proxy resolution doesn't return BIC)
const DEFAULT_PSP_BIC: Record<string, string> = {
    "SG": "DBSSSGSG",  // DBS Singapore
    "TH": "KASITHBK",  // Kasikorn Bank Thailand
    "ID": "BMRIIDJA",  // Bank Mandiri Indonesia
    "MY": "MABORKKL",  // Maybank Malaysia
    "PH": "BPIKIDJX",  // BPI Philippines
    "IN": "SBININBB",  // SBI India
};

// ============================================================================
// COMPONENT
// ============================================================================

export function InteractiveDemo() {
    const theme = useMantineTheme();
    const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
    const navigate = useNavigate();

    // Stepper state
    const [active, setActive] = useState(0);
    const [loading, setLoading] = useState(false);

    // Form state
    const [sourceCountry, setSourceCountry] = useState<string>("SG");
    const [destCountry, setDestCountry] = useState<string>("ID");
    const [amountType, setAmountType] = useState<"SOURCE" | "DESTINATION">("DESTINATION");
    const [amount, setAmount] = useState<number>(100000);
    const [proxyType, setProxyType] = useState<string>("MBNO");
    const [proxyValue, setProxyValue] = useState<string>("+6281234567890");
    const [scenario, setScenario] = useState<string>("happy");
    const [sourceFeeType, setSourceFeeType] = useState<"INVOICED" | "DEDUCTED">("INVOICED");
    const [actorModalOpen, setActorModalOpen] = useState(false);
    const [proxySuggestions, setProxySuggestions] = useState<string[]>([]);

    // Demo scenarios - validated via NotebookLM (Feb 4, 2026)
    const SCENARIOS = [
        { value: "happy", label: "✓ ACCC - Happy Flow (Success)", color: "green" },
        { value: "ab04", label: "✗ AB04 - Exchange Rate Mismatch", color: "orange" },
        { value: "tm01", label: "✗ TM01 - Quote Expired", color: "orange" },
        { value: "dupl", label: "✗ DUPL - Duplicate Payment", color: "orange" },
        { value: "am04", label: "✗ AM04 - Insufficient Funds", color: "red" },
        { value: "am02", label: "✗ AM02 - Amount Limit Exceeded", color: "red" },
        { value: "be23", label: "✗ BE23 - Invalid Proxy", color: "red" },
        { value: "ac04", label: "✗ AC04 - Closed Account", color: "red" },
        { value: "rr04", label: "✗ RR04 - Regulatory Block", color: "red" },
    ];

    // Quick Demo handler - runs full flow with preset data in ~5 seconds
    const [quickDemoLoading, setQuickDemoLoading] = useState(false);

    const handleQuickDemo = useCallback(async () => {
        setQuickDemoLoading(true);
        notifications.show({
            id: "quick-demo",
            loading: true,
            title: "Quick Demo Running",
            message: "Executing 17-step payment flow...",
            autoClose: false,
        });

        try {
            // Step 1-2: Resolve proxy
            setActive(0);
            await new Promise(r => setTimeout(r, 300));
            const res = await resolveProxy({
                sourceCountry: "SG",
                destinationCountry: "ID",
                proxyType: "MBNO",
                proxyValue: "+6281234567890"
            });
            setResolution({ recipientName: res.beneficiaryName || res.displayName || "Budi Santoso", recipientPsp: res.bankName || "Bank Mandiri" });

            // Step 3-4: Get quotes (SG → ID corridor)
            const quotesRes = await getQuotes("SG", "SGD", "ID", "IDR", 100000, "DESTINATION");
            // Pre-select first quote
            setQuotes(quotesRes.quotes);
            if (quotesRes.quotes.length === 0) {
                throw new Error("No quotes available");
            }

            // Step 5-6: Select best quote
            setActive(1);
            await new Promise(r => setTimeout(r, 500));
            const bestQuote = quotesRes.quotes[0];
            setSelectedQuote(bestQuote);

            // Step 7-9: Get PTD
            const ptdData = await getPreTransactionDisclosure(bestQuote.quoteId, sourceFeeType);
            setPtd(ptdData);
            setActive(2);
            await new Promise(r => setTimeout(r, 500));

            // Step 10-17: Submit payment
            const uetr = generateUUID();
            const pacs008Params = {
                uetr,
                quoteId: bestQuote.quoteId,
                exchangeRate: parseFloat(bestQuote.exchangeRate),
                sourceAmount: parseFloat(ptdData.senderPrincipal),
                sourceCurrency: "SGD",
                destinationAmount: 100000,
                destinationCurrency: "IDR",
                debtorName: "Quick Demo Sender",
                debtorAccount: "SG1234567890",
                debtorAgentBic: "DBSSSGSG",
                creditorName: "Budi Santoso",
                creditorAccount: "+6281234567890",
                creditorAgentBic: "BMRIIDJA",
                scenarioCode: scenario !== "happy" ? scenario : undefined,
            };

            const response = await submitPacs008(pacs008Params);
            setPaymentResult({ uetr: response.uetr, status: response.status });
            setActive(3);

            notifications.update({
                id: "quick-demo",
                color: "green",
                title: "Quick Demo Complete!",
                message: `Payment ${response.status === "ACCC" ? "succeeded" : "processed"}: ${response.uetr.substring(0, 8)}...`,
                icon: <IconCheck size={16} />,
                loading: false,
                autoClose: 5000,
            });
        } catch (err) {
            const error = err as Error & {
                statusReasonCode?: string;
                detail?: string;
                uetr?: string;
                errorBody?: { detail?: { uetr?: string; statusReasonCode?: string; errors?: string[] } };
            };

            const rejectionCode = error.statusReasonCode ||
                error.errorBody?.detail?.statusReasonCode ||
                "RJCT";
            const rejectionMessage = error.detail ||
                error.errorBody?.detail?.errors?.[0] ||
                error.message;

            // Show as expected rejection for unhappy scenarios
            if (scenario !== "happy") {
                setPaymentResult({ uetr: error.uetr || generateUUID(), status: rejectionCode, error: rejectionMessage });
                setActive(3);
                notifications.update({
                    id: "quick-demo",
                    color: "orange",
                    title: `Demo Rejection: ${rejectionCode}`,
                    message: rejectionMessage,
                    icon: <IconX size={16} />,
                    loading: false,
                    autoClose: 5000,
                });
            } else {
                notifications.update({
                    id: "quick-demo",
                    color: "red",
                    title: "Quick Demo Failed",
                    message: err instanceof Error ? err.message : "Failed to complete demo",
                    icon: <IconX size={16} />,
                    loading: false,
                    autoClose: 5000,
                });
            }
        } finally {
            setQuickDemoLoading(false);
        }
    }, [scenario]);

    // API data
    const [countries, setCountries] = useState<Country[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
    const [ptd, setPtd] = useState<FeeBreakdown | null>(null);
    const [resolution, setResolution] = useState<{ recipientName?: string; recipientPsp?: string } | null>(null);
    const [paymentResult, setPaymentResult] = useState<{ uetr: string; status: string; error?: string } | null>(null);

    // Countdown for quote
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Load countries on mount
    useEffect(() => {
        getCountries().then(data => setCountries(data.countries)).catch(console.error);
    }, []);

    const sourceCountryData = countries.find(c => c.countryCode === sourceCountry);
    const destCountryData = countries.find(c => c.countryCode === destCountry);

    // Step handlers
    const handleSearch = useCallback(async () => {
        setLoading(true);
        try {
            // Resolve proxy first
            const res = await resolveProxy({
                sourceCountry,
                destinationCountry: destCountry,
                proxyType,
                proxyValue
            });
            setResolution({ recipientName: res.beneficiaryName || res.displayName || "Demo Recipient", recipientPsp: res.bankName });

            // Then get quotes - use currencies from selected countries
            const sourceCurrency = sourceCountryData?.currencies?.[0]?.currencyCode || "SGD";
            const destCurrency = destCountryData?.currencies?.[0]?.currencyCode || "IDR";
            const quotesRes = await getQuotes(sourceCountry, sourceCurrency, destCountry, destCurrency, amount, amountType);
            setQuotes(quotesRes.quotes);

            if (quotesRes.quotes.length === 0) {
                notifications.show({
                    title: "No Quotes Available",
                    message: "No FXPs have rates for this corridor",
                    color: "orange",
                });
            }

            setActive(1);
        } catch (err) {
            const error = err as Error & { statusReasonCode?: string; errors?: string[]; detail?: string };
            notifications.show({
                title: `Payment Rejected (${error.statusReasonCode || 'RJCT'})`,
                message: error.errors?.[0] || error.detail || 'Payment failed',
                color: "red"
            });
        } finally {
            setLoading(false);
        }
    }, [sourceCountry, destCountry, amount, amountType, proxyType, proxyValue, sourceFeeType]);

    const handleSelectQuote = useCallback(async (quote: Quote) => {
        // Validate quote hasn't expired before selection
        const expiresAt = new Date(quote.expiresAt).getTime();
        const remainingSecs = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

        if (remainingSecs <= 0) {
            notifications.show({
                title: "Quote Expired",
                message: "This quote has expired. Please search for new quotes.",
                color: "red",
                icon: <IconX size={16} />,
            });
            return; // Prevent selection of expired quote
        }

        // Warn if quote is about to expire (< 60 seconds)
        if (remainingSecs < 60) {
            notifications.show({
                title: "Quote Expiring Soon",
                message: `This quote expires in ${remainingSecs} seconds. Complete payment quickly!`,
                color: "orange",
                icon: <IconAlertTriangle size={16} />,
            });
        }

        setSelectedQuote(quote);
        setLoading(true);
        try {
            const ptdData = await getPreTransactionDisclosure(quote.quoteId, sourceFeeType);
            setPtd(ptdData);
            setActive(2);
        } catch (err) {
            notifications.show({
                title: "PTD Error",
                message: err instanceof Error ? err.message : "Failed to get disclosure",
                color: "red",
            });
        } finally {
            setLoading(false);
        }
    }, [sourceFeeType]);

    const handleConfirmPayment = useCallback(async () => {
        if (!selectedQuote || !resolution) return;

        // Defense-in-depth: Check quote expiry before submission
        const quoteExpiresAt = new Date(selectedQuote.expiresAt).getTime();
        if (Date.now() >= quoteExpiresAt) {
            notifications.show({
                title: "Quote Expired",
                message: "This quote has expired since you selected it. Please go back and select a new quote.",
                color: "red",
                icon: <IconX size={16} />,
            });
            return;
        }

        setLoading(true);

        // Generate UETR for the payment
        const uetr = generateUUID();

        try {
            // STEP 12: Confirm Sender Approval
            // This locks the quote and validates validation rules
            const confirmation = await confirmSenderApproval(selectedQuote.quoteId);
            if (!confirmation.proceedToExecution) {
                throw new Error("Sender confirmation failed: " + confirmation.message);
            }

            notifications.show({
                title: "Step 12: Confirmed",
                message: "Sender approval recorded. Quote locked.",
                color: "blue",
                icon: <IconCheck size={16} />,
            });

            // STEP 13: Get Intermediary Agents (Routing)
            // Necessary for constructing the pacs.008
            const routing = await getIntermediaryAgents(selectedQuote.quoteId);

            // Get source country data for currency
            const sourceCountryData = countries.find(c => c.countryCode === sourceCountry);
            const destCountryData = countries.find(c => c.countryCode === destCountry);

            // Get primary currency for each country
            const sourceCurrency = sourceCountryData?.currencies?.[0]?.currencyCode || "SGD";
            const destCurrency = destCountryData?.currencies?.[0]?.currencyCode || "IDR";

            // Parse exchange rate (Quote.exchangeRate is string)
            const exchangeRateNum = parseFloat(selectedQuote.exchangeRate);

            // STEP 14: Submit Payment (pacs.008)
            // Build pacs.008 parameters from demo data
            const pacs008Params = {
                uetr,
                quoteId: selectedQuote.quoteId,
                exchangeRate: exchangeRateNum,
                sourceAmount: amountType === "SOURCE" ? amount : (ptd ? parseFloat(ptd.senderPrincipal) : amount / exchangeRateNum),
                sourceCurrency: sourceCurrency,
                destinationAmount: amountType === "DESTINATION" ? amount : (ptd ? parseFloat(ptd.recipientNetAmount) : amount * exchangeRateNum),
                destinationCurrency: destCurrency,
                debtorName: "Demo Sender",
                debtorAccount: "SG1234567890",
                debtorAgentBic: "DBSSSGSG", // DBS Singapore
                creditorName: resolution.recipientName || "Demo Recipient",
                creditorAccount: proxyValue,
                creditorAgentBic: resolution.recipientPsp || DEFAULT_PSP_BIC[destCountry] || "BMRIIDJA",
                // Step 13 Data:
                intermediaryAgent1Bic: routing.intermediaryAgent1?.bic,
                intermediaryAgent2Bic: routing.intermediaryAgent2?.bic,
                scenarioCode: scenario !== "happy" ? scenario : undefined,
            };

            // Submit real pacs.008 to backend
            const response = await submitPacs008(pacs008Params);

            // Success - payment accepted
            setPaymentResult({ uetr: response.uetr, status: response.status });
            notifications.show({
                title: "Payment Submitted",
                message: `UETR: ${response.uetr.substring(0, 8)}... - ${response.message}`,
                color: "green",
                icon: <IconCheck size={16} />,
            });
            setActive(3);

        } catch (err) {
            // Handle rejection from backend
            // The error structure is set by fetchJSON in api.ts:
            // error.status, error.statusReasonCode, error.detail, error.errorBody
            const error = err as Error & {
                status?: number;
                statusReasonCode?: string;
                detail?: string;
                uetr?: string;
                errorBody?: {
                    statusReasonCode?: string;
                    detail?: string;
                    message?: string;
                    uetr?: string;
                };
            };

            // Extract rejection details from error structure
            const rejectionCode = error.statusReasonCode ||
                error.errorBody?.statusReasonCode ||
                "RJCT";
            const rejectionMessage = error.detail ||
                error.errorBody?.detail ||
                error.errorBody?.message ||
                error.message ||
                "Payment rejected";
            const rejectionUetr = error.uetr ||
                error.errorBody?.uetr ||
                uetr;

            // Set payment result to show rejection in stepper
            setPaymentResult({
                uetr: rejectionUetr,
                status: rejectionCode,
                error: rejectionMessage
            });

            notifications.show({
                title: `Payment Rejected: ${rejectionCode}`,
                message: rejectionMessage,
                color: "red",
                icon: <IconX size={16} />,
            });
            setActive(3);
        } finally {
            setLoading(false);
        }
    }, [selectedQuote, resolution, scenario, countries, sourceCountry, destCountry, amountType, amount, ptd, proxyValue]);

    const handleReset = useCallback(() => {
        setActive(0);
        setQuotes([]);
        setSelectedQuote(null);
        setPtd(null);
        setResolution(null);
        setPaymentResult(null);
    }, []);

    // Country options
    const getCountryFlag = (code: string): string => {
        const flags: Record<string, string> = { SG: "🇸🇬", ID: "🇮🇩", TH: "🇹🇭", MY: "🇲🇾", PH: "🇵🇭", IN: "🇮🇳" };
        return flags[code] || "🌐";
    };
    const countryOptions = countries.map(c => ({
        value: c.countryCode,
        label: `${getCountryFlag(c.countryCode)} ${c.countryCode} - ${c.name}`,
    }));

    return (
        <Stack gap="lg">
            {/* Header */}
            <Box>
                <Breadcrumbs separator="→" mb="xs">
                    <Anchor href="/" size="sm" c="dimmed">Home</Anchor>
                    <Text size="sm">Interactive Demo</Text>
                </Breadcrumbs>
                <Group justify="space-between" align="flex-start" wrap="wrap">
                    <Box>
                        <Title order={2}>Interactive Payment Demo</Title>
                        <Text c="dimmed" size="sm">
                            Step-by-step through the Nexus payment flow with real API calls
                        </Text>
                    </Box>
                    <Group>
                        <Button
                            variant="gradient"
                            gradient={{ from: "blue", to: "cyan" }}
                            leftSection={<IconPlayerPlay size={16} />}
                            loading={quickDemoLoading}
                            onClick={handleQuickDemo}
                        >
                            Quick Demo
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => setActorModalOpen(true)}
                            leftSection={<IconUser size={16} />}
                        >
                            Register Actor
                        </Button>
                        <Badge size="lg" variant="light" color="blue" leftSection={<IconPlayerPlay size={14} />}>
                            Live API Mode
                        </Badge>
                    </Group>
                </Group>
                <ActorRegistrationModal opened={actorModalOpen} onClose={() => setActorModalOpen(false)} />
            </Box>

            {/* Info Banner */}
            <Alert icon={<IconInfoCircle size={18} />} title="Nexus Reference Flow" color="blue" variant="light">
                <Text size="sm">
                    This demo follows the actual Nexus reference implementation:
                    <strong> Source PSP</strong> requests quotes → <strong>Nexus</strong> returns list from FXP rates →
                    <strong> Source PSP</strong> selects quote → Constructs <Code>pacs.008</Code> with Quote ID.
                </Text>
            </Alert>

            {/* Stepper */}
            <Card withBorder p="xl">
                <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false} size={isMobile ? "xs" : "md"}>
                    {/* Step 1: Input Payment Details */}
                    <Stepper.Step
                        label="Payment Details"
                        description="Source, amount, destination"
                        icon={<IconSend size={18} />}
                    >
                        <Stack gap="lg" mt="xl">
                            <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
                                <Select
                                    label="Source Country"
                                    description="Where sender is located"
                                    data={countryOptions}
                                    value={sourceCountry}
                                    onChange={(v) => v && setSourceCountry(v)}
                                    searchable
                                    leftSection={<IconWorld size={16} />}
                                />
                                <Select
                                    label="Destination Country"
                                    description="Where recipient is located"
                                    data={countryOptions}
                                    value={destCountry}
                                    onChange={(v) => v && setDestCountry(v)}
                                    searchable
                                    leftSection={<IconWorld size={16} />}
                                />
                            </SimpleGrid>

                            <Radio.Group
                                label="Amount Specification"
                                description="How the sender specifies the amount"
                                value={amountType}
                                onChange={(v) => setAmountType(v as "SOURCE" | "DESTINATION")}
                            >
                                <Group mt="xs">
                                    <Radio value="SOURCE" label={`Send exact (${sourceCountryData?.currencies[0]?.currencyCode || "SGD"})`} />
                                    <Radio value="DESTINATION" label={`Recipient receives exact (${destCountryData?.currencies[0]?.currencyCode || "IDR"})`} />
                                </Group>
                            </Radio.Group>

                            <NumberInput
                                label="Amount"
                                description={amountType === "SOURCE"
                                    ? `Amount sender pays (${sourceCountryData?.currencies[0]?.currencyCode || "SGD"})`
                                    : `Amount recipient receives (${destCountryData?.currencies[0]?.currencyCode || "IDR"})`
                                }
                                value={amount}
                                onChange={(v) => setAmount(typeof v === "number" ? v : 100000)}
                                min={1}
                                thousandSeparator=","
                                leftSection={<Text size="xs" fw={500}>{amountType === "SOURCE" ? sourceCountryData?.currencies[0]?.currencyCode : destCountryData?.currencies[0]?.currencyCode}</Text>}
                            />

                            <Divider label="Recipient Proxy" labelPosition="center" />

                            <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
                                <Select
                                    label="Proxy Type"
                                    data={{
                                        SG: [
                                            { value: "MOBI", label: "📱 Mobile Number (PayNow)" },
                                            { value: "NRIC", label: "🆔 NRIC/FIN" },
                                            { value: "UEN", label: "🏢 Business UEN" },
                                            { value: "ACCT", label: "🏦 Bank Account" },
                                        ],
                                        TH: [
                                            { value: "MOBI", label: "📱 Mobile (PromptPay)" },
                                            { value: "NIDN", label: "🆔 National ID" },
                                            { value: "EWAL", label: "💳 e-Wallet ID" },
                                            { value: "ACCT", label: "🏦 Bank Account" },
                                        ],
                                        MY: [
                                            { value: "MOBI", label: "📱 Mobile (DuitNow)" },
                                            { value: "NRIC", label: "🆔 MyKad Number" },
                                            { value: "BIZN", label: "🏢 Business Reg" },
                                            { value: "ACCT", label: "🏦 Bank Account" },
                                        ],
                                        ID: [
                                            { value: "MBNO", label: "📱 Mobile (BI-FAST)" },
                                            { value: "EMAL", label: "📧 Email Address" },
                                            { value: "NIK", label: "🆔 National ID (NIK)" },
                                            { value: "ACCT", label: "🏦 Bank Account" },
                                        ],
                                        IN: [
                                            { value: "MBNO", label: "📱 Mobile (UPI)" },
                                            { value: "VPA", label: "💳 UPI Address (VPA)" },
                                            { value: "ACCT", label: "🏦 Bank Account" },
                                        ],
                                        PH: [
                                            { value: "MOBI", label: "📱 Mobile Number" },
                                            { value: "ACCT", label: "🏦 Bank Account" },
                                        ],
                                    }[destCountry] || [{ value: "MOBI", label: "📱 Mobile Number" }]}
                                    value={proxyType}
                                    onChange={(v) => v && setProxyType(v)}
                                />
                                <Autocomplete
                                    label="Proxy Value"
                                    description="Type to search registered contacts or enter any value"
                                    value={proxyValue}
                                    data={proxySuggestions}
                                    onChange={(val) => {
                                        // Auto-clean: if value contains em dash from option selection, extract pure proxy value
                                        const cleanVal = val.includes(" — ") ? val.split(" — ")[0] : val;
                                        setProxyValue(cleanVal);
                                        if (cleanVal.length >= 2) {
                                            searchProxies({ countryCode: destCountry, proxyType, q: cleanVal })
                                                .then(res => setProxySuggestions(
                                                    res.results.map(r => `${r.proxyValue} — ${r.displayName}`)
                                                ))
                                                .catch(() => setProxySuggestions([]));
                                        } else {
                                            setProxySuggestions([]);
                                        }
                                    }}
                                    placeholder={proxyType === "VPA" ? "rajesh@upi" : proxyType === "EMAL" ? "budi@example.co.id" : "+6281234567890"}
                                    leftSection={<IconPhone size={16} />}
                                />
                            </SimpleGrid>

                            <Divider label="Demo Scenario" labelPosition="center" />

                            <Select
                                label="Payment Outcome"
                                description="Select scenario to simulate (happy or rejection)"
                                data={SCENARIOS.map(s => ({ value: s.value, label: s.label }))}
                                value={scenario}
                                onChange={(v) => v && setScenario(v)}
                                leftSection={scenario === "happy" ? <IconCheck size={16} color="green" /> : <IconAlertTriangle size={16} color="orange" />}
                            />

                            <Divider label="Fee Type" labelPosition="center" />

                            <SegmentedControl
                                fullWidth
                                value={sourceFeeType}
                                onChange={(v) => setSourceFeeType(v as "INVOICED" | "DEDUCTED")}
                                data={[
                                    { label: "INVOICED (Fee added)", value: "INVOICED" },
                                    { label: "DEDUCTED (Fee from amount)", value: "DEDUCTED" }
                                ]}
                            />
                            <Text size="xs" c="dimmed" ta="center">
                                {sourceFeeType === "INVOICED"
                                    ? "Fee is added on top - recipient gets full amount"
                                    : "Fee is deducted from transfer - recipient gets less"}
                            </Text>

                            <Button
                                size="lg"
                                onClick={handleSearch}
                                loading={loading}
                                leftSection={<IconArrowsExchange size={20} />}
                            >
                                Search & Get Quotes
                            </Button>
                        </Stack>
                    </Stepper.Step>

                    {/* Step 2: Select Quote */}
                    <Stepper.Step
                        label="Select Quote"
                        description="Choose FXP rate"
                        icon={<IconArrowsExchange size={18} />}
                    >
                        <Stack gap="md" mt="xl">
                            {resolution && (
                                <Alert icon={<IconUser size={18} />} color="green" variant="light">
                                    <Text size="sm">
                                        <strong>Recipient Found:</strong> {resolution.recipientName}
                                        {resolution.recipientPsp && ` at ${resolution.recipientPsp}`}
                                    </Text>
                                </Alert>
                            )}

                            <Text fw={600}>Available FX Quotes ({quotes.length})</Text>

                            {quotes.length > 0 ? (
                                <SimpleGrid cols={isMobile ? 1 : 2} spacing="md">
                                    {quotes.map(quote => {
                                        const expiresAt = new Date(quote.expiresAt).getTime();
                                        const remainingSecs = Math.max(0, Math.floor((expiresAt - now) / 1000));
                                        const progressPct = (remainingSecs / 600) * 100;
                                        const isExpired = remainingSecs <= 0;

                                        return (
                                            <Card
                                                key={quote.quoteId}
                                                withBorder
                                                p="md"
                                                style={{
                                                    cursor: isExpired ? "not-allowed" : "pointer",
                                                    borderColor: selectedQuote?.quoteId === quote.quoteId
                                                        ? "var(--mantine-color-blue-filled)" : undefined,
                                                    opacity: isExpired ? 0.6 : 1,
                                                }}
                                                onClick={() => {
                                                    if (isExpired) {
                                                        notifications.show({
                                                            title: "Quote Expired",
                                                            message: "This quote has expired. Please search for new quotes.",
                                                            color: "red",
                                                            icon: <IconX size={16} />,
                                                        });
                                                        return;
                                                    }
                                                    handleSelectQuote(quote);
                                                }}
                                            >
                                                <Group justify="space-between" mb="xs">
                                                    <Text fw={600}>{quote.fxpName}</Text>
                                                    {isExpired ? (
                                                        <Badge size="sm" color="red">EXPIRED</Badge>
                                                    ) : (
                                                        <Badge size="sm" color="blue">Best Rate</Badge>
                                                    )}
                                                </Group>
                                                <Text size="lg" fw={700} c={isExpired ? "dimmed" : "green"}>
                                                    {destCountryData?.currencies[0]?.currencyCode} {Number(quote.creditorAccountAmount || quote.destinationInterbankAmount).toLocaleString()}
                                                </Text>
                                                <Text size="xs" c="dimmed">Net to recipient</Text>
                                                <Group mt="sm" gap="xs">
                                                    <Text size="xs" c={isExpired ? "red" : undefined}>
                                                        Rate: {Number(quote.exchangeRate).toFixed(4)}
                                                    </Text>
                                                    {isExpired ? (
                                                        <Badge size="xs" color="red">Expired</Badge>
                                                    ) : (
                                                        <>
                                                            <Progress value={progressPct} size="xs" w={50} color={remainingSecs < 60 ? "red" : "blue"} />
                                                            <Text size="xs" c={remainingSecs < 60 ? "red" : "dimmed"}>{Math.floor(remainingSecs / 60)}m {remainingSecs % 60}s</Text>
                                                        </>
                                                    )}
                                                </Group>
                                            </Card>
                                        );
                                    })}
                                </SimpleGrid>
                            ) : (
                                <Alert color="orange">No quotes available for this corridor</Alert>
                            )}
                        </Stack>
                    </Stepper.Step>

                    {/* Step 3: Confirm Payment */}
                    <Stepper.Step
                        label="Confirm"
                        description="Review & send"
                        icon={<IconReceipt size={18} />}
                    >
                        <Stack gap="md" mt="xl">
                            {ptd && <FeeCard fee={ptd} quote={selectedQuote} now={now} />}

                            {/* Embedded XML Preview */}
                            {selectedQuote && ptd && (
                                <Card withBorder bg="light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))" p="md">
                                    <Group justify="space-between" mb="xs">
                                        <Group gap="xs">
                                            <IconCode size={18} color="var(--mantine-color-blue-4)" />
                                            <Text fw={600} size="sm">ISO 20022 pacs.008 Message</Text>
                                        </Group>
                                        <Badge variant="outline" size="xs">Step 10: Initiation</Badge>
                                    </Group>

                                    <Text size="xs" c="dimmed" mb="md">
                                        The Source PSP constructs this XML message to initiate the cross-border payment via Nexus.
                                    </Text>

                                    <Box style={{ position: 'relative' }}>
                                        <ScrollArea h={300} type="always" offsetScrollbars>
                                            <Code block style={{ whiteSpace: "pre", fontSize: "0.7rem", backgroundColor: 'transparent' }}>
                                                {`<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.13">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>NEXUS-${Date.now()}</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${selectedQuote?.quoteId ?? 'QUOTE-ID'}</InstrId>
        <EndToEndId>E2E-${Date.now()}</EndToEndId>
        <TxId>TX-${Date.now()}</TxId>
      </PmtId>
      <PmtTpInf>
        <ClrSys><Prtry>FAST</Prtry></ClrSys>
      </PmtTpInf>
      <IntrBkSttlmAmt Ccy="${ptd?.sourceCurrency ?? 'SGD'}">${ptd?.senderPrincipal ?? '0.00'}</IntrBkSttlmAmt>
      <AddtlDtTm>
        <AccptncDtTm>${new Date().toISOString()}</AccptncDtTm>
      </AddtlDtTm>
      <XchgRate>${selectedQuote?.exchangeRate ?? '1.0000'}</XchgRate>
      <ChrgBr>SHAR</ChrgBr>
      <Dbtr><Nm>Demo Sender</Nm></Dbtr>
      <DbtrAcct><Id><Othr><Id>SG1234567890</Id></Othr></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BICFI>DBSSSGSG</BICFI></FinInstnId></DbtrAgt>
      <IntrmyAgt1><FinInstnId><BICFI>DBSSSGSG</BICFI></FinInstnId></IntrmyAgt1>
      <CdtrAgt><FinInstnId><BICFI>${resolution?.recipientPsp || DEFAULT_PSP_BIC[destCountry] || "BMRIIDJA"}</BICFI></FinInstnId></CdtrAgt>
      <Cdtr><Nm>${resolution?.recipientName || "Demo Recipient"}</Nm></Cdtr>
      <CdtrAcct><Id><Othr><Id>${proxyValue}</Id></Othr></Id></CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`}
                                            </Code>
                                        </ScrollArea>
                                    </Box>
                                </Card>
                            )}

                            <Group>
                                <Button
                                    size="lg"
                                    color="green"
                                    flex={1}
                                    onClick={handleConfirmPayment}
                                    loading={loading}
                                    leftSection={<IconCheck size={20} />}
                                >
                                    Confirm & Send Payment
                                </Button>
                            </Group>
                        </Stack>
                    </Stepper.Step>

                    {/* Step 4: Lifecycle Trace */}
                    <Stepper.Completed>
                        <Stack gap="md" mt="xl">
                            {paymentResult && (paymentResult.status === "ACCC" || paymentResult.status === "ACSP" || paymentResult.status === "ACSC") ? (
                                <>
                                    <Alert icon={<IconCheck size={18} />} color="green" title={paymentResult.status === "ACCC" ? "Payment Completed" : paymentResult.status === "ACSC" ? "Settlement Completed" : "Settlement in Progress"}>
                                        {paymentResult.status === "ACCC"
                                            ? "Settlement confirmed. Recipient has been credited."
                                            : "Payment accepted by Nexus. Settlement is in progress."}
                                    </Alert>

                                    <Card withBorder p="md">
                                        <Group justify="space-between" align="center" mb="md">
                                            <Text size="sm" fw={500}>Transaction ID (UETR)</Text>
                                            <Badge color="green">{paymentResult.status}</Badge>
                                        </Group>
                                        <Code block style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>
                                            {paymentResult.uetr}
                                        </Code>
                                        <Button
                                            onClick={() => navigate(`/explorer?uetr=${paymentResult.uetr}`)}
                                            variant="light"
                                            size="xs"
                                            mt="sm"
                                            leftSection={<IconInfoCircle size={14} />}
                                        >
                                            View in Payment Explorer
                                        </Button>
                                    </Card>

                                    <Card withBorder>
                                        <Title order={5} mb="md">Payment Lifecycle Trace</Title>
                                        <Accordion defaultValue={["1", "2", "3"]} multiple>
                                            <Accordion.Item value="1">
                                                <Accordion.Control>
                                                    <Group justify="space-between">
                                                        <Text size="sm" fw={500}>Phase 1: Payment Setup</Text>
                                                        <Badge size="sm" color="green">3/3</Badge>
                                                    </Group>
                                                </Accordion.Control>
                                                <Accordion.Panel>
                                                    <Timeline active={3} bulletSize={20} lineWidth={2}>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>1. Source Country Selected</Text><Badge size="xs" variant="outline">-</Badge></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">GET /countries</Text>
                                                        </Timeline.Item>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>2. Destination Country Selected</Text><Badge size="xs" variant="outline">-</Badge></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">GET /countries/{destCountry}/address-types</Text>
                                                        </Timeline.Item>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>3. Amount Specified</Text><Badge size="xs" variant="outline">-</Badge></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">{amountType} amount: {amount.toLocaleString()}</Text>
                                                        </Timeline.Item>
                                                    </Timeline>
                                                </Accordion.Panel>
                                            </Accordion.Item>

                                            <Accordion.Item value="2">
                                                <Accordion.Control>
                                                    <Group justify="space-between">
                                                        <Text size="sm" fw={500}>Phase 2: Quoting & FX</Text>
                                                        <Badge size="sm" color="green">3/3</Badge>
                                                    </Group>
                                                </Accordion.Control>
                                                <Accordion.Panel>
                                                    <Timeline active={3} bulletSize={20} lineWidth={2}>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>4. Quotes Retrieved</Text><Badge size="xs" variant="outline">pacs.008</Badge></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">GET /quotes — {quotes.length} quotes received</Text>
                                                        </Timeline.Item>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>5. Quote Selected</Text><Badge size="xs" variant="outline">-</Badge></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">{selectedQuote?.fxpName} @ {Number(selectedQuote?.exchangeRate || 0).toFixed(4)}</Text>
                                                        </Timeline.Item>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>6. PTD Generated</Text><Badge size="xs" variant="outline">-</Badge></Group>
                                                        }>
                                                            {ptd && (
                                                                <Box mt={4} p="xs" bg="light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))" style={{ borderRadius: "4px" }}>
                                                                    <Text size="xs">Rate: {ptd.marketRate} • Total Debit: {ptd.sourceCurrency} {ptd.senderTotal}</Text>
                                                                </Box>
                                                            )}
                                                        </Timeline.Item>
                                                    </Timeline>
                                                </Accordion.Panel>
                                            </Accordion.Item>

                                            <Accordion.Item value="3">
                                                <Accordion.Control>
                                                    <Group justify="space-between">
                                                        <Text size="sm" fw={500}>Phase 3: Processing & Settlement</Text>
                                                        <Badge size="sm" color="green">3/3</Badge>
                                                    </Group>
                                                </Accordion.Control>
                                                <Accordion.Panel>
                                                    <Timeline active={3} bulletSize={20} lineWidth={2}>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>7. pacs.008 Submitted</Text><Badge size="xs" variant="outline">pacs.008</Badge></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">POST /iso20022/pacs008 — UETR: {paymentResult.uetr.substring(0, 8)}...</Text>
                                                        </Timeline.Item>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>8. Nexus Validated</Text><Badge size="xs" variant="outline">pacs.002</Badge></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">Quote ID, rate, SAPs verified</Text>
                                                        </Timeline.Item>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>9. Settlement Complete</Text><Badge size="xs" variant="outline">pacs.002</Badge></Group>
                                                        }>
                                                            <Text size="xs" c="green" fw={700} mt={4}>{paymentResult.status}: Settlement Confirmed</Text>
                                                        </Timeline.Item>
                                                    </Timeline>
                                                </Accordion.Panel>
                                            </Accordion.Item>
                                        </Accordion>
                                    </Card>
                                </>
                            ) : paymentResult ? (
                                <>
                                    <Alert icon={<IconX size={18} />} color="red" title={`Payment Rejected: ${paymentResult.status}`}>
                                        {paymentResult.error}
                                    </Alert>

                                    <Card withBorder p="md">
                                        <Group justify="space-between" align="center" mb="md">
                                            <Text size="sm" fw={500}>Transaction ID (UETR)</Text>
                                            <Badge color="red">{paymentResult.status}</Badge>
                                        </Group>
                                        <Code block style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>
                                            {paymentResult.uetr}
                                        </Code>
                                        <Button
                                            onClick={() => navigate(`/explorer?uetr=${paymentResult.uetr}`)}
                                            variant="light"
                                            size="xs"
                                            mt="sm"
                                            leftSection={<IconInfoCircle size={14} />}
                                        >
                                            View in Payment Explorer
                                        </Button>
                                    </Card>

                                    <Card withBorder>
                                        <Title order={5} mb="md">Payment Lifecycle Trace</Title>
                                        <Accordion defaultValue={["1", "2", "3"]} multiple>
                                            <Accordion.Item value="1">
                                                <Accordion.Control>
                                                    <Group justify="space-between">
                                                        <Text size="sm" fw={500}>Phase 1: Payment Setup</Text>
                                                        <Badge size="sm" color="green">3/3</Badge>
                                                    </Group>
                                                </Accordion.Control>
                                                <Accordion.Panel>
                                                    <Timeline active={3} bulletSize={20} lineWidth={2}>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>1. Source Country Selected</Text></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">GET /countries</Text>
                                                        </Timeline.Item>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>2. Destination Country Selected</Text></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">GET /countries/{destCountry}/address-types</Text>
                                                        </Timeline.Item>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>3. Amount Specified</Text></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">{amountType} amount: {amount.toLocaleString()}</Text>
                                                        </Timeline.Item>
                                                    </Timeline>
                                                </Accordion.Panel>
                                            </Accordion.Item>

                                            <Accordion.Item value="2">
                                                <Accordion.Control>
                                                    <Group justify="space-between">
                                                        <Text size="sm" fw={500}>Phase 2: Quoting & FX</Text>
                                                        <Badge size="sm" color="green">3/3</Badge>
                                                    </Group>
                                                </Accordion.Control>
                                                <Accordion.Panel>
                                                    <Timeline active={3} bulletSize={20} lineWidth={2}>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>4. Quotes Retrieved</Text><Badge size="xs" variant="outline">pacs.008</Badge></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">GET /quotes — {quotes.length} quotes received</Text>
                                                        </Timeline.Item>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>5. Quote Selected</Text></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">{selectedQuote?.fxpName} @ {Number(selectedQuote?.exchangeRate || 0).toFixed(4)}</Text>
                                                        </Timeline.Item>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>6. PTD Generated</Text></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">Pre-transaction disclosure computed</Text>
                                                        </Timeline.Item>
                                                    </Timeline>
                                                </Accordion.Panel>
                                            </Accordion.Item>

                                            <Accordion.Item value="3">
                                                <Accordion.Control>
                                                    <Group justify="space-between">
                                                        <Text size="sm" fw={500}>Phase 3: Processing & Settlement</Text>
                                                        <Badge size="sm" color="red">1/2</Badge>
                                                    </Group>
                                                </Accordion.Control>
                                                <Accordion.Panel>
                                                    <Timeline active={1} bulletSize={20} lineWidth={2}>
                                                        <Timeline.Item bullet={<IconCheck size={10} />} color="green" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>7. pacs.008 Submitted</Text><Badge size="xs" variant="outline">pacs.008</Badge></Group>
                                                        }>
                                                            <Text size="xs" c="dimmed" fs="italic">POST /iso20022/pacs008 — UETR: {paymentResult.uetr.substring(0, 8)}...</Text>
                                                        </Timeline.Item>
                                                        <Timeline.Item bullet={<IconX size={10} />} color="red" title={
                                                            <Group gap="xs"><Text size="sm" fw={700}>8. Rejected: {paymentResult.status}</Text><Badge size="xs" color="red" variant="filled">pacs.002</Badge></Group>
                                                        }>
                                                            <Text size="xs" c="red" fw={500}>{paymentResult.error}</Text>
                                                            <Code block mt="xs" style={{ fontSize: "0.7rem" }}>
                                                                {`pacs.002 Status: ${paymentResult.status}\nReason: ${paymentResult.error}\nUETR: ${paymentResult.uetr}`}
                                                            </Code>
                                                        </Timeline.Item>
                                                    </Timeline>
                                                </Accordion.Panel>
                                            </Accordion.Item>
                                        </Accordion>
                                    </Card>
                                </>
                            ) : null}

                            <Button onClick={handleReset} variant="light" leftSection={<IconRefresh size={18} />}>
                                Start New Payment
                            </Button>
                        </Stack>
                    </Stepper.Completed>
                </Stepper>
            </Card>
        </Stack>
    );
}

export default InteractiveDemo;
