import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  REVIEW_CONFIG,
  parametersForModel,
  reviewModelForRuntimeId,
} from "../config/review";
import { EXAMPLES } from "../data/examples";
import { useToast } from "./ToastContext";
import { useSession } from "./SessionContext";
import { t } from "../i18n/messages";
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
import { runReview } from "../services/reviewRunner";
import {
  isInferenceProvider,
  type InferenceProvider,
  type Language,
  type ReviewHistorySummary,
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

export type ReviewErrorKind = "generic" | "webgpu";
export type SaveReviewOutcome = "saved" | "need-auth" | "failed";

function visibleReviewError(message: string): string {
  return message.replace(/\s*\(HTTP \d[\s\S]*\)\s*$/, "").trim() || message;
}

function kindForReviewError(error: unknown): ReviewErrorKind {
  if (isWebGpuUnavailableError(error)) return "webgpu";
  return "generic";
}

interface ReviewSessionValue {
  language: Language;
  code: string;
  result: ReviewResult | null;
  isReviewing: boolean;
  reviewError: string | null;
  reviewErrorKind: ReviewErrorKind | null;
  provider: InferenceProvider;
  modelId: string;
  parameters: ReviewParameters;
  modelOptions: { id: string; label: string }[];
  selectedModelOption: { id: string; label: string } | undefined;
  selectedBrowserModel: ReturnType<typeof reviewModelForRuntimeId>;
  showModelDetails: boolean;
  tokenOptions: { value: number; labelKey: (typeof TOKEN_CHOICES)[number]["labelKey"] }[];
  selectedTokenOption:
    | { value: number; labelKey: (typeof TOKEN_CHOICES)[number]["labelKey"] }
    | undefined;
  modelProgress: ModelProgress | null;
  isPreloading: boolean;
  isBrowserReady: boolean;
  isSaving: boolean;
  history: ReviewHistorySummary[];
  isHistoryLoading: boolean;
  historyError: string | null;
  lineCount: number;
  setCode: (code: string) => void;
  handleLanguageChange: (language: Language) => void;
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
  handleOpenHistory: (entry: ReviewHistorySummary) => Promise<boolean>;
  handleStarHistory: (id: string, starred: boolean) => Promise<void>;
  handleDeleteHistory: (id: string) => Promise<void>;
  loadHistory: () => Promise<void>;
  loadUploadedCode: (code: string, language?: Language) => void;
  clearEditor: () => void;
}

const ReviewSessionContext = createContext<ReviewSessionValue | null>(null);

export function ReviewSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { pushToast } = useToast();
  const abortRef = useRef<AbortController | null>(null);
  const ignoreAbortToastRef = useRef(false);

  const [language, setLanguage] = useState<Language>("polite");
  const [code, setCodeState] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewErrorKind, setReviewErrorKind] = useState<ReviewErrorKind | null>(
    null,
  );
  const provider: InferenceProvider = "browser";
  const [modelId, setModelId] = useState("");
  const [parameters, setParameters] = useState<ReviewParameters>(() =>
    parametersForModel(REVIEW_CONFIG.model),
  );
  const [checkpoint, setCheckpoint] = useState<BrowserReviewCheckpoint | null>(
    null,
  );
  const [modelProgress, setModelProgress] = useState<ModelProgress | null>(null);
  const [isPreloading, setIsPreloading] = useState(false);
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<ReviewHistorySummary[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const lineCount = code ? code.split("\n").length : 0;

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
  }, [user]);

  useEffect(() => {
    setModelId((current) => reviewModelForRuntimeId(current)?.id ?? "");
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!reviewModelForRuntimeId(modelId)) {
      setIsPreloading(false);
      setIsBrowserReady(false);
      return;
    }

    let cancelled = false;
    setIsPreloading(true);
    setIsBrowserReady(false);

    void preloadBrowserModel((progress) => {
      if (!cancelled) setModelProgress(progress);
    })
      .then(() => {
        if (cancelled) return;
        setIsPreloading(false);
        setIsBrowserReady(true);
        setModelProgress((current) => {
          if (current?.streamedText || current?.result) return current;
          return {
            progress: 1,
            text: current?.text || t("browser.ready"),
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
            : t("review.failed"),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [modelId]);

  const canContinueReview = checkpointMatches(checkpoint, { code, language });
  const interruptedOutput =
    canContinueReview && checkpoint ? checkpoint.streamedText : null;

  const resetOutput = () => {
    setResult(null);
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
    if (!reviewModelForRuntimeId(modelId)) {
      setReviewError(t("review.selectModel"));
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
    }
    setReviewError(null);
    setReviewErrorKind(null);
    setModelProgress({
      progress: 0,
      text: resumeFrom ? t("browser.resuming") : t("browser.preparing"),
      streamedText: resumeFrom,
    });
    try {
      const onProgress = (progress: ModelProgress) => {
        setModelProgress(progress);
        if (progress.result) setResult(progress.result);
      };
      const nextResult = await runReview(
        {
          code,
          language,
          parameters,
          resumeFrom,
          resumeElapsedMs: resumeFrom ? checkpoint?.elapsedMs : undefined,
        },
        onProgress,
        undefined,
        controller.signal,
      );
      setCheckpoint(null);
      setResult(nextResult);
    } catch (error) {
      if (controller.signal.aborted) {
        if (!ignoreAbortToastRef.current) {
          if (isReviewInterruptedError(error)) {
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

  const handleOpenHistory = async (entry: ReviewHistorySummary) => {
    try {
      const full = await getHistoryEntry(entry.id);
      const inference = full.result.inference;
      const savedProvider = inference?.provider;
      const savedParameters = inference?.generationConfig;

      setLanguage(full.language);
      setCodeState(full.code);
      setResult(full.result);
        setReviewError(null);
      setReviewErrorKind(null);
      setHistoryError(null);
      setCheckpoint(null);
      setModelId(
        reviewModelForRuntimeId(inference?.modelId)?.id ??
          REVIEW_CONFIG.defaultModelId,
      );
      if (
        savedProvider &&
        isInferenceProvider(savedProvider) &&
        savedParameters
      ) {
        setParameters({
          temperature: savedParameters.temperature,
          maxTokens: savedParameters.maxTokens,
        });
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

  const selectedBrowserModel = reviewModelForRuntimeId(modelId);
  const parameterLimits = {
    maxTokens:
      selectedBrowserModel?.limits.maxTokens ?? REVIEW_CONFIG.limits.maxTokens,
  };
  const modelOptions = REVIEW_CONFIG.models.map((model) => ({
    id: model.id,
    label: model.label,
  }));
  const selectedModelOption = modelOptions.find(
    (option) => option.id === modelId,
  );
  const showModelDetails = Boolean(selectedBrowserModel);
  const tokenOptions = TOKEN_CHOICES.filter(
    (option) => option.value <= parameterLimits.maxTokens,
  );
  const selectedTokenOption =
    tokenOptions.find((option) => option.value === parameters.maxTokens) ??
    tokenOptions[tokenOptions.length - 1];

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
    setParameters((current) => ({
      ...current,
      [name]: normalized,
    }));
    resetOutput();
  };

  const handleModelChange = (nextModelId: string) => {
    setModelId(nextModelId);
    const nextBrowserModel = reviewModelForRuntimeId(nextModelId);
    if (nextBrowserModel) {
      setParameters(parametersForModel(nextBrowserModel));
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
    isReviewing,
    reviewError,
    reviewErrorKind,
    provider,
    modelId,
    parameters,
    modelOptions,
    selectedModelOption,
    selectedBrowserModel,
    showModelDetails,
    tokenOptions,
    selectedTokenOption,
    modelProgress,
    isPreloading,
    isBrowserReady,
    isSaving,
    history,
    isHistoryLoading,
    historyError,
    lineCount,
    canContinueReview,
    interruptedOutput,
    setCode,
    handleLanguageChange,
    handleModelChange,
    handleParameterChange,
    handleReview,
    handleContinueReview,
    handleCancelReview,
    handleSaveReview,
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
      setModelProgress(null);
      setIsReviewing(false);
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
