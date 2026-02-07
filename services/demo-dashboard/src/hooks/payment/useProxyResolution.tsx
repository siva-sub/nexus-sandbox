/**
 * useProxyResolution Hook
 * 
 * Handles proxy-to-account resolution (mobile/email/QR → account mapping).
 * Extracted from Payment.tsx to improve maintainability and testability.
 */

import { useState, useCallback } from "react";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { resolveProxy } from "../../services/api";
import type { ProxyResolutionResult } from "../../types";

interface UseProxyResolutionParams {
    onStepAdvance?: (stepId: number, details?: string) => void;
    onMarkStepError?: (stepId: number, error: string) => void;
}

export function useProxyResolution({
    onStepAdvance,
    onMarkStepError,
}: UseProxyResolutionParams = {}) {
    const [resolution, setResolution] = useState<ProxyResolutionResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Resolve proxy to account details
    const resolve = useCallback(async (
        destCountry: string,
        proxyType: string,
        proxyValue: string,
        structuredData?: Record<string, string>,
        scenarioCode?: string,
        sourceCountry?: string
    ): Promise<ProxyResolutionResult | null> => {
        setLoading(true);
        setError(null);
        onStepAdvance?.(8); // Resolve Proxy step

        try {
            const result = await resolveProxy({
                sourceCountry: sourceCountry || 'SG',
                destinationCountry: destCountry,
                proxyType,
                proxyValue,
                structuredData: structuredData || {},
                scenarioCode,
            });

            // Check if resolution was successful
            if (result.status === "VALIDATED" || result.status === "ACCC") {
                setResolution(result);
                notifications.show({
                    title: "Recipient Verified",
                    message: `Found: ${result.beneficiaryName || result.displayName}`,
                    color: "green",
                    icon: <IconCheck size={16} />,
                });
                onStepAdvance?.(9); // Sanctions Check step
                return result;
            } else {
                // Resolution failed
                const errorMessage = result.statusReasonCode
                    ? `Resolution failed: ${result.statusReasonCode}`
                    : "Recipient not found";
                setError(errorMessage);
                setResolution(result);
                notifications.show({
                    title: "Resolution Failed",
                    message: result.displayName || errorMessage,
                    color: "red",
                    icon: <IconAlertCircle size={16} />,
                });
                onMarkStepError?.(8, errorMessage);
                return result;
            }
        } catch (err) {
            const errorMessage = "Could not resolve recipient address";
            setError(errorMessage);
            notifications.show({
                title: "Resolution Error",
                message: errorMessage,
                color: "red",
                icon: <IconAlertCircle size={16} />,
            });
            onMarkStepError?.(8, errorMessage);
            return null;
        } finally {
            setLoading(false);
        }
    }, [onStepAdvance, onMarkStepError]);

    // Clear resolution state
    const clearResolution = useCallback(() => {
        setResolution(null);
        setError(null);
    }, []);

    return {
        resolution,
        loading,
        error,
        resolve,
        clearResolution,
    };
}
