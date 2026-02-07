/**
 * FeeCard Component
 * 
 * Displays Pre-Transaction Disclosure with fee breakdown, G20 alignment,
 * and exchange rate details. Extracted from Payment.tsx.
 */

import {
    Card,
    Group,
    Stack,
    Text,
    Title,
    Badge,
    Table,
    Box,
    Progress,
} from "@mantine/core";
import { IconReceipt, IconInfoCircle } from "@tabler/icons-react";
import type { FeeBreakdown, Quote } from "../../types";

interface FeeCardProps {
    fee: FeeBreakdown;
    quote: Quote | null;
    now: number;
}

// Helper to safely parse numbers - returns 0 if NaN
const safeNumber = (val: string | undefined | null): number => {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
};

/**
 * FeeCard displays the Pre-Transaction Disclosure (PTD) with:
 * - G20 target alignment (<3% total cost)
 * - Amount to be debited breakdown
 * - Amount recipient receives breakdown  
 * - Exchange rate details (market, customer, effective)
 * - Quote expiration countdown
 */
export function FeeCard({ fee, quote, now }: FeeCardProps) {
    // Use totalCostPercent from backend (calculated vs mid-market benchmark)
    const totalCostPct = Math.abs(safeNumber(fee.totalCostPercent));
    const isWithinG20 = totalCostPct <= 3.0;

    return (
        <Card withBorder radius="md" p="xl" bg="light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))">
            <Group justify="space-between" mb="lg">
                <Group gap="xs">
                    <IconReceipt size={24} color="var(--mantine-color-blue-filled)" />
                    <Title order={4}>Pre-Transaction Disclosure</Title>
                </Group>
                <Badge
                    color={isWithinG20 ? "green" : "orange"}
                    variant="light"
                    leftSection={<IconInfoCircle size={14} />}
                >
                    {totalCostPct.toFixed(2)}% Cost vs Mid-Market
                </Badge>
            </Group>

            {/* G20 Alignment Visualization */}
            <Box mb="xl">
                <Group justify="space-between" mb={5}>
                    <Text size="xs" fw={700} tt="uppercase">G20 Target Alignment (&lt; 3%)</Text>
                    <Text size="xs" c={isWithinG20 ? "green" : "orange"}>
                        {isWithinG20 ? "Target Met" : "Above Target"}
                    </Text>
                </Group>
                <Progress
                    value={Math.min(100, (totalCostPct / 3.0) * 100)}
                    color={isWithinG20 ? "green" : "orange"}
                    size="sm"
                    radius="xl"
                />
            </Box>

            <Stack gap="xl">
                {/* Sender Side (Amount to be Debited) */}
                <Box>
                    <Text size="sm" c="dimmed">Amount to be Debited (Total)</Text>
                    <Text size="xl" fw={700} c="blue">
                        {fee.sourceCurrency} {safeNumber(fee.senderTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                </Box>

                {/* Recipient Side (Amount Received) */}
                <Box>
                    <Text size="sm" c="dimmed">Amount Recipient Receives (Net)</Text>
                    <Text size="xl" fw={700} c="green">
                        {fee.destinationCurrency} {safeNumber(fee.recipientNetAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                </Box>

                {/* Fee Breakdown Table - Sender side */}
                <Table withColumnBorders={false} verticalSpacing="sm">
                    <Table.Tbody>
                        <Table.Tr>
                            <Table.Td fw={500}>Sender Principal (FX Amount)</Table.Td>
                            <Table.Td ta="right">{fee.sourceCurrency} {safeNumber(fee.senderPrincipal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Td c="dimmed" pl="lg">+ Source PSP Fee ({fee.sourcePspFeeType})</Table.Td>
                            <Table.Td ta="right" c="dimmed">{fee.sourceCurrency} {safeNumber(fee.sourcePspFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Td c="dimmed" pl="lg">+ Nexus Scheme Fee</Table.Td>
                            <Table.Td ta="right" c="dimmed">{fee.sourceCurrency} {safeNumber(fee.schemeFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                        <Table.Tr style={{ borderTop: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
                            <Table.Td fw={600}>= Total Debited</Table.Td>
                            <Table.Td ta="right" fw={600}>{fee.sourceCurrency} {safeNumber(fee.senderTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                    </Table.Tbody>
                </Table>

                {/* Fee Breakdown Table - Recipient side */}
                <Table withColumnBorders={false} verticalSpacing="sm">
                    <Table.Tbody>
                        <Table.Tr>
                            <Table.Td fw={500}>Payout Amount (Gross)</Table.Td>
                            <Table.Td ta="right">{fee.destinationCurrency} {safeNumber(fee.payoutGrossAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Td c="dimmed" pl="lg">− Destination PSP Fee (Deducted)</Table.Td>
                            <Table.Td ta="right" c="dimmed">{fee.destinationCurrency} {safeNumber(fee.destinationPspFee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                        <Table.Tr style={{ borderTop: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
                            <Table.Td fw={600}>= Recipient Receives (Net)</Table.Td>
                            <Table.Td ta="right" fw={600}>{fee.destinationCurrency} {safeNumber(fee.recipientNetAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Table.Td>
                        </Table.Tr>
                    </Table.Tbody>
                </Table>

                {/* Exchange Rates with explicit units */}
                <Stack gap="xs" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))" style={{ borderRadius: "8px" }}>
                    <Group justify="space-between">
                        <Stack gap={0}>
                            <Text size="sm" fw={700}>Market FX Rate (Mid)</Text>
                            <Text size="xs" c="dimmed">Before spread applied</Text>
                        </Stack>
                        <Text size="lg" fw={700} c="blue">
                            1 {fee.sourceCurrency} = {safeNumber(fee.marketRate).toLocaleString(undefined, { maximumFractionDigits: 4 })} {fee.destinationCurrency}
                        </Text>
                    </Group>
                    <Group justify="space-between">
                        <Stack gap={0}>
                            <Text size="sm" c="dimmed">Customer Rate (After {fee.appliedSpreadBps} bps spread)</Text>
                            <Text size="xs" c="dimmed">Rate used for FX conversion</Text>
                        </Stack>
                        <Text size="sm" c="cyan" fw={500}>
                            1 {fee.sourceCurrency} = {safeNumber(fee.customerRate).toLocaleString(undefined, { maximumFractionDigits: 4 })} {fee.destinationCurrency}
                        </Text>
                    </Group>
                    <Group justify="space-between">
                        <Stack gap={0}>
                            <Text size="sm" c="dimmed">Effective Rate (All-In)</Text>
                            <Text size="xs" c="dimmed">Recipient receives ÷ Sender pays</Text>
                        </Stack>
                        <Text size="sm" c="orange" fw={500}>
                            1 {fee.sourceCurrency} = {safeNumber(fee.effectiveRate).toLocaleString(undefined, { maximumFractionDigits: 4 })} {fee.destinationCurrency}
                        </Text>
                    </Group>
                    {quote && (
                        <Badge color="blue" variant="dot" size="lg" fullWidth mt="sm">
                            Quote locked for next {Math.max(0, Math.floor((new Date(quote.expiresAt.replace(/\+00:00Z$/, 'Z')).getTime() - now) / 1000))}s
                        </Badge>
                    )}
                </Stack>
            </Stack>
        </Card>
    );
}
