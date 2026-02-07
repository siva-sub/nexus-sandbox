/**
 * LifecycleAccordion Component
 * 
 * Displays the 17-step payment lifecycle progress with phase grouping.
 * Extracted from Payment.tsx.
 */

import {
    Accordion,
    Timeline,
    Group,
    Stack,
    Text,
    Badge,
    Box,
} from "@mantine/core";
import type { LifecycleStep } from "../../hooks/payment";
import type { FeeBreakdown, ProxyResolutionResult, IntermediaryAgentsResponse } from "../../types";

interface LifecycleAccordionProps {
    stepsByPhase: { phase: number; name: string; steps: LifecycleStep[] }[];
    getStepIcon: (status: LifecycleStep["status"]) => React.ReactNode;
    getStepColor: (status: LifecycleStep["status"]) => string;
    feeBreakdown: FeeBreakdown | null;
    resolution: ProxyResolutionResult | null;
    intermediaries: IntermediaryAgentsResponse | null;
}

/**
 * LifecycleAccordion displays the 17-step payment lifecycle organized by phases:
 * - Phase 1: Payment Setup
 * - Phase 2: Quoting
 * - Phase 3: Addressing & Compliance
 * - Phase 4: Processing & Settlement
 * - Phase 5: Completion
 * 
 * Each phase shows completion status and individual step timelines with
 * contextual details for key steps (fees, resolution, intermediaries).
 */
export function LifecycleAccordion({
    stepsByPhase,
    getStepIcon,
    getStepColor,
    feeBreakdown,
    resolution,
    intermediaries,
}: LifecycleAccordionProps) {
    return (
        <Accordion defaultValue={["1", "2"]} multiple>
            {stepsByPhase.map(({ phase, name, steps }) => {
                const completedCount = steps.filter((s) => s.status === "completed").length;
                const hasActive = steps.some((s) => s.status === "active");
                return (
                    <Accordion.Item key={phase} value={String(phase)}>
                        <Accordion.Control>
                            <Group justify="space-between">
                                <Text size="sm" fw={500}>Phase {phase}: {name}</Text>
                                <Badge size="sm" color={completedCount === steps.length ? "green" : hasActive ? "blue" : "gray"}>
                                    {completedCount}/{steps.length}
                                </Badge>
                            </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Timeline active={steps.findIndex((s) => s.status === "active")} bulletSize={20} lineWidth={2}>
                                {steps.map((step) => (
                                    <Timeline.Item
                                        key={step.id}
                                        bullet={getStepIcon(step.status)}
                                        color={getStepColor(step.status)}
                                        title={
                                            <Group justify="space-between" align="center" style={{ width: "100%" }}>
                                                <Group gap="xs">
                                                    <Text size="sm" fw={700}>{step.id}. {step.name}</Text>
                                                    {step.isoMessage !== "-" && (
                                                        <Badge size="xs" variant="outline">{step.isoMessage}</Badge>
                                                    )}
                                                </Group>
                                                <Text size="xs" c="dimmed" fs="italic">{step.apiCall}</Text>
                                            </Group>
                                        }
                                    >
                                        {/* Step-specific details */}
                                        {step.id === 6 && feeBreakdown && (
                                            <Box mt={4} p="xs" bg="light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))" style={{ borderRadius: "4px" }}>
                                                <Text size="xs">Rate: {feeBreakdown.marketRate} • Total Debit: {feeBreakdown.sourceCurrency} {feeBreakdown.senderTotal}</Text>
                                            </Box>
                                        )}
                                        {step.id === 8 && resolution && (
                                            <Box mt={4} p="xs" bg="light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))" style={{ borderRadius: "4px" }}>
                                                <Text size="xs" fw={700} c="green">Resolved: {resolution.beneficiaryName || resolution.accountName}</Text>
                                                <Text size="xs">Bank: {resolution.agentBic || resolution.bankName || "Unknown"}</Text>
                                            </Box>
                                        )}
                                        {step.id === 13 && intermediaries && (
                                            <Box mt={4} p="xs" bg="light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))" style={{ borderRadius: "4px" }}>
                                                <Stack gap={4}>
                                                    <Group justify="space-between">
                                                        <Text size="xs" fw={700} c="blue">Source SAP (IntermediaryAgent1)</Text>
                                                        <Text size="xs">{intermediaries.intermediaryAgent1.bic}</Text>
                                                    </Group>
                                                    <Text size="xs" c="dimmed">Acc: {intermediaries.intermediaryAgent1.accountNumber}</Text>
                                                    <Group justify="space-between">
                                                        <Text size="xs" fw={700} c="green">Dest SAP (IntermediaryAgent2)</Text>
                                                        <Text size="xs">{intermediaries.intermediaryAgent2.bic}</Text>
                                                    </Group>
                                                    <Text size="xs" c="dimmed">Acc: {intermediaries.intermediaryAgent2.accountNumber}</Text>
                                                </Stack>
                                            </Box>
                                        )}
                                        {step.id === 17 && step.status === "completed" && (
                                            <Text size="xs" c="green" fw={700} mt={4}>ACCC: Settlement Confirmed</Text>
                                        )}
                                    </Timeline.Item>
                                ))}
                            </Timeline>
                        </Accordion.Panel>
                    </Accordion.Item>
                );
            })}
        </Accordion>
    );
}
