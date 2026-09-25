import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { APP_CONFIG } from "../config/app";
import {
  REVIEW_CONFIG,
  parametersForModel,
  reviewModelForRuntimeId,
} from "../config/review";
import { EXAMPLES } from "../data/examples";
import { useToast } from "./ToastContext";
import { useSession } from "./SessionContext";
import { useLocale } from "../i18n/locale";
import { inferenceProviderLabelKey } from "../i18n/messages";
import { appendReviewLog } from "../review/activityLog";
import {
  isCloudStartupError,
  isCloudStartupMessage,
} from "../review/cloudError";
import {
  checkpointMatches,
  isReviewInterruptedError,
  type BrowserReviewCheckpoint,
} from "../review/resume";
import { isWebGpuUnavailableError } from "../review/webgpuError";
import {
  deleteHistory,
  getHistoryEntry,
  listHistory,
  saveHistory,
  sortHistorySummaries,
  starHistory,
  toHistorySummary,
} from "../services/history";
import { preloadBrowserModel, type ModelProgress } from "../services/review";
import { listInferenceProviders } from "../services/reviewCloud";
import { runReview } from "../services/reviewRunner";
import {
  isInferenceProvider,
  type InferenceProvider,
  type InferenceProviderInfo,
  type Language,
  type ReviewFinding,
  type ReviewHistorySummary,
  type ReviewLogEntry,
  type ReviewParameters,
  type ReviewResult,
} from "../types/review";

const TOKEN_CHOICES = REVIEW_CONFIG.tokenChoices;

function clampTemperature(value: number): number {
  const { min, max, step } = REVIEW_CONFIG.temperature;
  const clamped = Math.min(max, Math.max(min, value));
  if (!(step > 0)) return clamped;
  const stepped = min + Math.round((clamped - min) / step) * step;
  return Number(Math.min(max, Math.max(min, stepped)).toFixed(2));
}

const browserParameters: ReviewParameters = parametersForModel(
  REVIEW_CONFIG.model,
);

export type ReviewErrorKind = "generic" | "startup" | "webgpu";
export type SaveReviewOutcome = "saved" | "need-auth" | "failed";

function visibleReviewError(message: string): string {
  return message.replace(/\s*\(HTTP \d[\s\S]*\)\s*$/, "").trim() || message;
}

function kindForReviewError(error: unknown): ReviewErrorKind {
  if (isCloudStartupError(error)) return "startup";
  if (isWebGpuUnavailableError(error)) return "webgpu";
  return "generic";
}

interface ReviewSessionValue {
  language: Language;
  code: string;
  result: ReviewResult | null;
  selectedFinding: string | null;
  isReviewing: boolean;
  reviewError: string | null;
  reviewErrorKind: ReviewErrorKind | null;
  provider: InferenceProvider;
  modelId: string;
  cloudProviders: InferenceProviderInfo[];
  parameters: ReviewParameters;
  providerOptions: { id: InferenceProvider; label: string; hint?: string }[];
  providerLabel: string;
  modelOptions: { id: string; label: string }[];
  selectedModelOption: { id: string; label: string } | undefined;
  selectedBrowserModel: ReturnType<typeof reviewModelForRuntimeId>;
  selectedCloudModel: InferenceProviderInfo | undefined;
  showModelDetails: boolean;
  tokenOptions: { value: number; labelKey: (typeof TOKEN_CHOICES)[number]["labelKey"] }[];
  selectedTokenOption:
    | { value: number; labelKey: (typeof TOKEN_CHOICES)[number]["labelKey"] }
    | undefined;
  modelProgress: ModelProgress | null;
  modelLogs: ReviewLogEntry[];
  showDiagnostics: boolean;
  canOpenDiagnostics: boolean;
  isPreloading: boolean;
  isBrowserReady: boolean;
  gpuStarting: boolean;
  isSaving: boolean;
  history: ReviewHistorySummary[];
  isHistoryLoading: boolean;
  historyError: string | null;
  lineCount: number;
  setCode: (code: string) => void;
  setShowDiagnostics: (open: boolean | ((current: boolean) => boolean)) => void;
  handleLanguageChange: (language: Language) => void;
  handleProviderChange: (provider: InferenceProvider) => void;
  handleModelChange: (modelId: string) => void;
  handleParameterChange: (
    name: "temperature" | "maxTokens",
    value: number,
  ) => void;
  canContinueReview: boolean;
  interruptedOutput: string | null;
  handleReview: (options?: { resume?: boolean }) => Promise<void>;
  handleContinueReview: () => Promise<void>;
  handleCancelReview: () => void;
  handleSaveReview: () => Promise<SaveReviewOutcome>;
  handleFindingSelect: (finding: ReviewFinding) => void;
  handleOpenHistory: (entry: ReviewHistorySummary) => Promise<boolean>;
  handleStarHistory: (id: string, starred: boolean) => Promise<void>;
  handleDeleteHistory: (id: string) => Promise<void>;
  loadHistory: () => Promise<void>;
  loadUploadedCode: (code: string, language?: Language) => void;
  clearEditor: () => void;
}

const ReviewSessionContext = createContext<ReviewSessionValue | null>(null);

export function ReviewSessionProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { user } = useSession();
  const { pushToast } = useToast();
  const abortRef = useRef<AbortController | null>(null);
  const ignoreAbortToastRef = useRef(false);
  const translateRef = useRef(t);
  translateRef.current = t;

  const [language, setLanguage] = useState<Language>("python");
  const [code, setCodeState] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewErrorKind, setReviewErrorKind] = useState<ReviewErrorKind | null>(
    null,
  );
  const [provider, setProvider] = useState<InferenceProvider>(
    REVIEW_CONFIG.defaultProvider,
  );
  const [modelId, setModelId] = useState("");
  const [cloudProviders, setCloudProviders] = useState<InferenceProviderInfo[]>(
    [],
  );
  const [parametersByProvider, setParametersByProvider] = useState<
    Record<InferenceProvider, ReviewParameters>
  >({
    browser: browserParameters,
    modal: browserParameters,
    huggingface: browserParameters,
    custom: browserParameters,
  });
  const [checkpoint, setCheckpoint] = useState<BrowserReviewCheckpoint | null>(
    null,
  );
  const [modelProgress, setModelProgress] = useState<ModelProgress | null>(null);
  const [modelLogs, setModelLogs] = useState<ReviewLogEntry[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isPreloading, setIsPreloading] = useState(false);
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<ReviewHistorySummary[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const lineCount = code ? code.split("\n").length : 0;

  const appendModelLog = useCallback((entry: ReviewLogEntry) => {
    setModelLogs((current) =>
      appendReviewLog(current, entry, APP_CONFIG.ui.modelLogLimit),
    );
  }, []);

  const loadHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      return;
    }
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(sortHistorySummaries(await listHistory()));
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : t("history.loadError"),
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }, [t, user]);

  useEffect(() => {
    void listInferenceProviders()
      .then((providers) => {
        setCloudProviders(providers);
        setParametersByProvider((current) => {
          const next = { ...current };
          for (const candidate of providers) {
            next[candidate.id] = {
              temperature: candidate.temperature,
              maxTokens: Math.min(
                REVIEW_CONFIG.generation.maxTokens,
                candidate.maxTokens,
              ),
              maxFindings: REVIEW_CONFIG.limits.maxFindings,
            };
          }
          return next;
        });
        setProvider((current) =>
          current === "browser" ||
          providers.some((candidate) => candidate.id === current)
            ? current
            : "browser",
        );
      })
      .catch(() => setCloudProviders([]));
  }, []);

  useEffect(() => {
    if (provider === "browser") {
      setModelId((current) => reviewModelForRuntimeId(current)?.id ?? "");
      return;
    }
    const selected = cloudProviders.find((candidate) => candidate.id === provider);
    if (!selected) return;
    setModelId((current) => (current === selected.modelId ? current : ""));
  }, [cloudProviders, provider]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (provider !== "browser" || !reviewModelForRuntimeId(modelId)) {
      setIsPreloading(false);
      setIsBrowserReady(false);
      return;
    }

    let cancelled = false;
    setIsPreloading(true);
    setIsBrowserReady(false);
    const onLog = (entry: ReviewLogEntry) => {
      if (!cancelled) appendModelLog(entry);
    };

    void preloadBrowserModel((progress) => {
      if (!cancelled) setModelProgress(progress);
    }, onLog)
      .then(() => {
        if (cancelled) return;
        setIsPreloading(false);
        setIsBrowserReady(true);
        setModelProgress((current) => {
          if (current?.streamedText || current?.result) return current;
          return {
            progress: 1,
            text: current?.text || translateRef.current("browser.ready"),
          };
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setIsPreloading(false);
        setIsBrowserReady(false);
        setReviewErrorKind(kindForReviewError(error));
        setReviewError(
          error instanceof Error
            ? visibleReviewError(error.message)
            : translateRef.current("review.failed"),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [appendModelLog, modelId, provider]);

  const canContinueReview =
    provider === "browser" && checkpointMatches(checkpoint, { code, language });
  const interruptedOutput =
    canContinueReview && checkpoint ? checkpoint.streamedText : null;
  const canOpenDiagnostics = modelLogs.length > 0;

  useEffect(() => {
    if (!canOpenDiagnostics) setShowDiagnostics(false);
  }, [canOpenDiagnostics]);

  const resetOutput = () => {
    setResult(null);
    setSelectedFinding(null);
    setReviewError(null);
    setReviewErrorKind(null);
    setCheckpoint(null);
  };

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setCodeState(EXAMPLES[nextLanguage]);
    resetOutput();
  };

  const handleReview = async (options?: { resume?: boolean }) => {
    if (!code.trim() || isReviewing) return;
    const selectedCloud =
      provider === "browser"
        ? undefined
        : cloudProviders.find((candidate) => candidate.id === provider);
    if (
      (provider === "browser" && !reviewModelForRuntimeId(modelId)) ||
      (provider !== "browser" &&
        (!selectedCloud || modelId !== selectedCloud.modelId))
    ) {
      setReviewError(t("review.selectModel"));
      setReviewErrorKind("generic");
      return;
    }
    if (provider !== "browser" && !user) {
      setReviewError(t("review.signInCloud"));
      setReviewErrorKind("generic");
      return;
    }

    const resumeFrom =
      options?.resume && canContinueReview
        ? checkpoint?.streamedText
        : undefined;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsReviewing(true);
    if (!resumeFrom) {
      setResult(null);
      setCheckpoint(null);
      setModelLogs([]);
    }
    setSelectedFinding(null);
    setReviewError(null);
    setReviewErrorKind(null);
    setModelProgress({
      progress: 0,
      text:
        provider === "browser"
          ? resumeFrom
            ? t("browser.resuming")
            : t("browser.preparing")
          : t("cloud.connecting"),
      streamedText: resumeFrom,
    });
    try {
      const onProgress = (progress: ModelProgress) => {
        setModelProgress(progress);
        if (progress.result) setResult(progress.result);
      };
      const nextResult = await runReview(
        provider,
        {
          code,
          language,
          parameters: {
            ...parametersByProvider[provider],
            maxFindings: REVIEW_CONFIG.limits.maxFindings,
          },
          resumeFrom,
          resumeElapsedMs: resumeFrom ? checkpoint?.elapsedMs : undefined,
        },
        onProgress,
        appendModelLog,
        controller.signal,
      );
      setCheckpoint(null);
      setResult(nextResult);
    } catch (error) {
      if (controller.signal.aborted) {
        if (!ignoreAbortToastRef.current) {
          if (isReviewInterruptedError(error) && provider === "browser") {
            setCheckpoint({
              code,
              language,
              streamedText: error.streamedText,
              elapsedMs: error.elapsedMs,
              partialResult: error.partialResult,
            });
            if (error.partialResult) setResult(error.partialResult);
            pushToast("success", t("results.paused"));
          } else {
            pushToast("success", t("results.cancelled"));
          }
        }
        return;
      }
      setResult((current) =>
        current
          ? current.partial
            ? { ...current, partial: false }
            : current
          : null,
      );
      setReviewErrorKind(kindForReviewError(error));
      setReviewError(
        error instanceof Error
          ? visibleReviewError(error.message)
          : t("review.failed"),
      );
    } finally {
      ignoreAbortToastRef.current = false;
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsReviewing(false);
      setModelProgress(null);
    }
  };

  const handleCancelReview = () => {
    abortRef.current?.abort();
  };

  const handleContinueReview = () => handleReview({ resume: true });

  const handleSaveReview = async (): Promise<SaveReviewOutcome> => {
    if (!result || result.partial || isSaving) return "failed";
    if (!user) return "need-auth";

    setIsSaving(true);
    setHistoryError(null);
    try {
      const savedEntry = await saveHistory({ code, language, result });
      setHistory((current) =>
        sortHistorySummaries([
          toHistorySummary(savedEntry),
          ...current.filter((entry) => entry.id !== savedEntry.id),
        ]),
      );
      pushToast("success", t("history.saved"));
      return "saved";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("history.saveError");
      setHistoryError(message);
      pushToast("error", message);
      return "failed";
    } finally {
      setIsSaving(false);
    }
  };

  const handleFindingSelect = (finding: ReviewFinding) => {
    setSelectedFinding((current) =>
      current === finding.id ? null : finding.id,
    );
  };

  const handleOpenHistory = async (entry: ReviewHistorySummary) => {
    try {
      const full = await getHistoryEntry(entry.id);
      const inference = full.result.inference;
      const savedProvider = inference?.provider;
      const savedParameters = inference?.generationConfig;

      setLanguage(full.language);
      setCodeState(full.code);
      setResult(full.result);
      setSelectedFinding(null);
      setReviewError(null);
      setReviewErrorKind(null);
      setHistoryError(null);
      setCheckpoint(null);
      if (savedProvider && isInferenceProvider(savedProvider)) {
        setProvider(savedProvider);
        if (savedProvider === "browser") {
          setModelId(
            reviewModelForRuntimeId(inference?.modelId)?.id ??
              REVIEW_CONFIG.defaultModelId,
          );
        } else {
          const savedCloud = cloudProviders.find(
            (candidate) => candidate.id === savedProvider,
          );
          setModelId(
            savedCloud?.modelId ??
              inference?.modelId ??
              REVIEW_CONFIG.defaultModelId,
          );
        }
        if (savedParameters) {
          setParametersByProvider((current) => ({
            ...current,
            [savedProvider]: {
              temperature: savedParameters.temperature,
              maxTokens: savedParameters.maxTokens,
              maxFindings: REVIEW_CONFIG.limits.maxFindings,
            },
          }));
        }
      }
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("history.openError");
      setHistoryError(message);
      pushToast("error", message);
      return false;
    }
  };

  const handleStarHistory = async (id: string, starred: boolean) => {
    try {
      const updated = await starHistory(id, starred);
      setHistory((current) =>
        sortHistorySummaries(
          current.map((entry) => (entry.id === id ? { ...entry, ...updated } : entry)),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("history.starError");
      setHistoryError(message);
      pushToast("error", message);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await deleteHistory(id);
      setHistory((current) => current.filter((entry) => entry.id !== id));
      pushToast("success", t("history.deleted"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("history.deleteError");
      setHistoryError(message);
      pushToast("error", message);
    }
  };

  const cloudProvider = cloudProviders.find(
    (candidate) => candidate.id === provider,
  );
  const selectedBrowserModel =
    provider === "browser" ? reviewModelForRuntimeId(modelId) : undefined;
  const selectedCloudModel =
    provider !== "browser" &&
    cloudProvider &&
    modelId === cloudProvider.modelId
      ? cloudProvider
      : undefined;
  const parameters = parametersByProvider[provider];
  const parameterLimits = {
    maxTokens:
      provider === "browser"
        ? (selectedBrowserModel?.limits.maxTokens ??
          REVIEW_CONFIG.limits.maxTokens)
        : (cloudProvider?.maxTokens ?? parameters.maxTokens),
  };
  const providerOptions: { id: InferenceProvider; label: string; hint?: string }[] = [
    {
      id: "browser",
      label: t("provider.browser"),
      hint: t("provider.recommended"),
    },
    ...cloudProviders.map((option) => {
      const labelKey = inferenceProviderLabelKey(option.id);
      return {
        id: option.id,
        label: labelKey ? t(labelKey) : option.label,
      };
    }),
  ];
  const providerLabel =
    providerOptions.find((option) => option.id === provider)?.label ?? "";
  const modelOptions =
    provider === "browser"
      ? REVIEW_CONFIG.models.map((model) => ({
          id: model.id,
          label: model.label,
        }))
      : cloudProvider
        ? [
            {
              id: cloudProvider.modelId,
              label:
                reviewModelForRuntimeId(cloudProvider.modelId)?.label ??
                cloudProvider.modelId,
            },
          ]
        : [];
  const selectedModelOption = modelOptions.find(
    (option) => option.id === modelId,
  );
  const showModelDetails = Boolean(selectedBrowserModel || selectedCloudModel);
  const tokenOptions = TOKEN_CHOICES.filter(
    (option) => option.value <= parameterLimits.maxTokens,
  );
  const selectedTokenOption =
    tokenOptions.find((option) => option.value === parameters.maxTokens) ??
    tokenOptions[tokenOptions.length - 1];
  const gpuStarting =
    reviewErrorKind === "startup" ||
    (isReviewing &&
      provider !== "browser" &&
      (isCloudStartupMessage(modelProgress?.text ?? "") ||
        modelLogs.some((entry) => isCloudStartupMessage(entry.message))));

  const handleParameterChange = (
    name: "temperature" | "maxTokens",
    value: number,
  ) => {
    if (!Number.isFinite(value)) return;
    const normalized =
      name === "temperature"
        ? clampTemperature(value)
        : Math.max(
            REVIEW_CONFIG.parameterMins.maxTokens,
            Math.min(Math.round(value), parameterLimits.maxTokens),
          );
    setParametersByProvider((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        [name]: normalized,
        maxFindings: REVIEW_CONFIG.limits.maxFindings,
      },
    }));
    resetOutput();
  };

  const handleProviderChange = (nextProvider: InferenceProvider) => {
    setProvider(nextProvider);
    setModelId("");
    resetOutput();
    setShowDiagnostics(false);
  };

  const handleModelChange = (nextModelId: string) => {
    setModelId(nextModelId);
    const nextBrowserModel = reviewModelForRuntimeId(nextModelId);
    if (provider === "browser" && nextBrowserModel) {
      setParametersByProvider((current) => ({
        ...current,
        browser: parametersForModel(nextBrowserModel),
      }));
    } else if (cloudProvider && cloudProvider.modelId === nextModelId) {
      setParametersByProvider((current) => ({
        ...current,
        [provider]: {
          temperature: cloudProvider.temperature,
          maxTokens: Math.min(
            REVIEW_CONFIG.generation.maxTokens,
            cloudProvider.maxTokens,
          ),
          maxFindings: REVIEW_CONFIG.limits.maxFindings,
        },
      }));
    }
    resetOutput();
  };

  const setCode = (nextCode: string) => {
    if (nextCode === code) return;
    setCodeState(nextCode);
    resetOutput();
  };

  const loadUploadedCode = (nextCode: string, nextLanguage?: Language) => {
    setCodeState(nextCode);
    if (nextLanguage) {
      setLanguage(nextLanguage);
    }
    resetOutput();
  };

  const value: ReviewSessionValue = {
    language,
    code,
    result,
    selectedFinding,
    isReviewing,
    reviewError,
    reviewErrorKind,
    provider,
    modelId,
    cloudProviders,
    parameters,
    providerOptions,
    providerLabel,
    modelOptions,
    selectedModelOption,
    selectedBrowserModel,
    selectedCloudModel,
    showModelDetails,
    tokenOptions,
    selectedTokenOption,
    modelProgress,
    modelLogs,
    showDiagnostics,
    canOpenDiagnostics,
    isPreloading,
    isBrowserReady,
    gpuStarting,
    isSaving,
    history,
    isHistoryLoading,
    historyError,
    lineCount,
    canContinueReview,
    interruptedOutput,
    setCode,
    setShowDiagnostics,
    handleLanguageChange,
    handleProviderChange,
    handleModelChange,
    handleParameterChange,
    handleReview,
    handleContinueReview,
    handleCancelReview,
    handleSaveReview,
    handleFindingSelect,
    handleOpenHistory,
    handleStarHistory,
    handleDeleteHistory,
    loadHistory,
    loadUploadedCode,
    clearEditor: () => {
      if (abortRef.current) {
        ignoreAbortToastRef.current = true;
        abortRef.current.abort();
      }
      setCodeState("");
      resetOutput();
      setModelLogs([]);
      setModelProgress(null);
      setIsReviewing(false);
      setShowDiagnostics(false);
    },
  };

  return (
    <ReviewSessionContext.Provider value={value}>
      {children}
    </ReviewSessionContext.Provider>
  );
}

export function useReviewSession(): ReviewSessionValue {
  const value = useContext(ReviewSessionContext);
  if (!value) {
    throw new Error("useReviewSession must be used within ReviewSessionProvider.");
  }
  return value;
}
