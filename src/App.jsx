import { useEffect, useMemo, useRef, useState } from "react";
import yourshoLogo from "../logo.png";
import { ApiError, enqueue, fetchQueueStatus, login } from "./api.js";

const POLLING_INTERVAL = 3000;
const LOST_REENQUEUE_DELAY_SECONDS = 3;
const RESULT_REVEAL_DELAY_MS = 1400;
const STORAGE_KEY = "morupark-queue-session";

const eventMeta = {
  title: "한 번에 몰리면 재미 없죠.",
  accent: "실시간 대기열 상태를 확인하고 있어요.",
  eventName: "2026 모루파크 상품 이벤트",
};

const tips = [
  "로그인 후 번호표를 발급받으면 자동으로 대기 상태를 갱신합니다.",
  "새로고침 버튼으로 즉시 상태를 다시 확인할 수 있습니다.",
];

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : "",
      waitingToken: typeof parsed.waitingToken === "string" ? parsed.waitingToken : "",
      studentId: typeof parsed.studentId === "string" ? parsed.studentId : "",
      phoneNumber: typeof parsed.phoneNumber === "string" ? parsed.phoneNumber : "",
    };
  } catch {
    return null;
  }
}

function writeStoredSession(session) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  window.localStorage.removeItem(STORAGE_KEY);
}

function formatPeople(value) {
  return `${value.toLocaleString("ko-KR")}명`;
}

function formatSeconds(value) {
  if (value <= 0) {
    return "곧 입장";
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  if (minutes <= 0) {
    return `${seconds}초`;
  }

  if (seconds === 0) {
    return `${minutes}분`;
  }

  return `${minutes}분 ${seconds}초`;
}

function digitsOnly(value) {
  return value.replace(/\D/g, "");
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function isRecoverableAuthError(error) {
  return error instanceof ApiError && error.status === 401;
}

function App() {
  const storedSession = useMemo(() => readStoredSession(), []);
  const [studentId, setStudentId] = useState(storedSession?.studentId ?? "");
  const [phoneNumber, setPhoneNumber] = useState(storedSession?.phoneNumber ?? "");
  const [accessToken, setAccessToken] = useState(storedSession?.accessToken ?? "");
  const [waitingToken, setWaitingToken] = useState(storedSession?.waitingToken ?? "");
  const [phase, setPhase] = useState(storedSession?.waitingToken ? "queue" : "login");
  const [queueRank, setQueueRank] = useState(0);
  const [estimatedWaitSeconds, setEstimatedWaitSeconds] = useState(0);
  const [initialWaitSeconds, setInitialWaitSeconds] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReenqueuing, setIsReenqueuing] = useState(false);
  const [reenqueueCountdown, setReenqueueCountdown] = useState(0);
  const [failureReasonCode, setFailureReasonCode] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const statusRequestSequence = useRef(0);
  const reenqueueFlowSequence = useRef(0);

  const invalidateStatusResponse = () => {
    statusRequestSequence.current += 1;
  };

  const invalidateReenqueueFlow = () => {
    reenqueueFlowSequence.current += 1;
  };

  const progressPercent = useMemo(() => {
    if (phase !== "queue") {
      return 100;
    }

    if (initialWaitSeconds <= 0) {
      return 18;
    }

    const elapsed = Math.max(0, initialWaitSeconds - estimatedWaitSeconds);
    return Math.min(100, 18 + (elapsed / initialWaitSeconds) * 82);
  }, [estimatedWaitSeconds, initialWaitSeconds, phase]);

  const waitingAhead = Math.max(0, queueRank - 1);

  useEffect(() => {
    if (!accessToken && !waitingToken) {
      clearStoredSession();
      return;
    }

    writeStoredSession({
      studentId,
      phoneNumber,
      accessToken,
      waitingToken,
    });
  }, [accessToken, phoneNumber, studentId, waitingToken]);

  const resetSession = () => {
    invalidateStatusResponse();
    invalidateReenqueueFlow();
    setAccessToken("");
    setWaitingToken("");
    setQueueRank(0);
    setEstimatedWaitSeconds(0);
    setInitialWaitSeconds(0);
    setStatusMessage("");
    setLastUpdatedAt(null);
    setIsRefreshing(false);
    setIsSubmitting(false);
    setIsReenqueuing(false);
    setReenqueueCountdown(0);
    setFailureReasonCode("");
    setPhase("login");
    clearStoredSession();
  };

  const recoverLostQueue = async () => {
    if (!accessToken || isReenqueuing) {
      return;
    }

    invalidateStatusResponse();
    const flowSequence = reenqueueFlowSequence.current + 1;
    reenqueueFlowSequence.current = flowSequence;
    setIsReenqueuing(true);
    setFailureReasonCode("LOST");
    setReenqueueCountdown(LOST_REENQUEUE_DELAY_SECONDS);
    setPhase("failed");

    try {
      for (let remainingSeconds = LOST_REENQUEUE_DELAY_SECONDS; remainingSeconds > 0; remainingSeconds -= 1) {
        if (flowSequence !== reenqueueFlowSequence.current) {
          return;
        }

        setReenqueueCountdown(remainingSeconds);
        setStatusMessage(`아쉽게 이번 회차는 놓쳤어요. ${remainingSeconds}초 후 대기열에 다시 진입합니다.`);
        await sleep(1000);
      }

      if (flowSequence !== reenqueueFlowSequence.current) {
        return;
      }

      setPhase("processing");
      setStatusMessage("다음 회차 대기열 입장권을 준비하고 있어요.");

      const enqueuePayload = await enqueue({ accessToken });
      if (flowSequence !== reenqueueFlowSequence.current) {
        return;
      }

      setWaitingToken(enqueuePayload.waitingToken);
      setQueueRank(0);
      setEstimatedWaitSeconds(0);
      setInitialWaitSeconds(0);
      setFailureReasonCode("");
      setStatusMessage("재도전 기회를 잡았어요! 새로운 번호표를 발급해 대기열 상태를 확인 중입니다.");
      setErrorMessage("");
      setPhase("processing");
      setLastUpdatedAt(null);
    } catch (error) {
      setWaitingToken("");
      setStatusMessage("자동 재진입에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setErrorMessage(error.message);
      setPhase("failed");
    } finally {
      if (flowSequence === reenqueueFlowSequence.current) {
        setIsReenqueuing(false);
        setReenqueueCountdown(0);
      }
    }
  };

  const applyQueueStatus = async (payload) => {
    const nextStatus = payload?.status;
    const failureReason =
      typeof payload?.reason === "string" ? payload.reason.trim().toUpperCase() : "";

    if (nextStatus === "WAITING") {
      const nextEstimatedWaitSeconds = Number(payload.estimatedWaitSeconds ?? 0);
      setQueueRank(Number(payload.rank ?? 0));
      setEstimatedWaitSeconds(nextEstimatedWaitSeconds);
      setInitialWaitSeconds((prev) => {
        if (prev <= 0) {
          return nextEstimatedWaitSeconds;
        }
        return Math.max(prev, nextEstimatedWaitSeconds);
      });
      setStatusMessage("호출 순서가 되면 자동으로 다음 단계로 넘어갑니다.");
      setPhase("queue");
    }

    if (nextStatus === "PROCESSING") {
      setStatusMessage("두근두근, 상품 뽑기를 진행하고 있어요.");
      setPhase("processing");
    }

    if (nextStatus === "SUCCESS") {
      invalidateStatusResponse();
      setWaitingToken("");
      setFailureReasonCode("");
      setStatusMessage("뽑기 결과를 확정하고 있어요.");
      setPhase("processing");
      await sleep(RESULT_REVEAL_DELAY_MS);
      setStatusMessage("축하합니다! 당첨이 확정되었습니다. 상품 수령 안내는 개별 연락드릴 예정입니다.");
      setPhase("success");
      setLastUpdatedAt(new Date());
      return;
    }

    if (nextStatus === "FAILED") {
      if (failureReason === "LOST") {
        invalidateStatusResponse();
        setWaitingToken("");
        setFailureReasonCode("LOST");
        setStatusMessage("뽑기 결과를 정리하고 있어요.");
        setPhase("processing");
        await sleep(RESULT_REVEAL_DELAY_MS);
        await recoverLostQueue();
        setLastUpdatedAt(new Date());
        return;
      }

      if (failureReason === "SOLD_OUT") {
        invalidateStatusResponse();
        setWaitingToken("");
        setFailureReasonCode("SOLD_OUT");
        setStatusMessage("준비된 재고가 모두 소진되어 이벤트가 종료되었습니다.");
        setPhase("soldout");
      } else {
        invalidateStatusResponse();
        setWaitingToken("");
        setFailureReasonCode(failureReason || "FAILED");
        setStatusMessage(payload?.message ?? "요청 처리에 실패했습니다. 다시 시도해주세요.");
        setPhase("failed");
      }
    }

    setLastUpdatedAt(new Date());
  };

  const refreshQueueStatus = async ({ silent = false } = {}) => {
    if (!accessToken || !waitingToken || isReenqueuing) {
      return;
    }

    if (!silent) {
      setIsRefreshing(true);
    }

    const requestSequence = statusRequestSequence.current + 1;
    statusRequestSequence.current = requestSequence;

    try {
      const payload = await fetchQueueStatus({ accessToken, waitingToken });
      if (requestSequence !== statusRequestSequence.current) {
        return;
      }

      setErrorMessage("");
      await applyQueueStatus(payload);
    } catch (error) {
      if (isRecoverableAuthError(error)) {
        resetSession();
      }
      setErrorMessage(error.message);
    } finally {
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (!accessToken || !waitingToken) {
      return undefined;
    }

    if (phase !== "queue" && phase !== "processing") {
      return undefined;
    }

    refreshQueueStatus({ silent: true });

    const timer = window.setInterval(() => {
      refreshQueueStatus({ silent: true });
    }, POLLING_INTERVAL);

    return () => {
      window.clearInterval(timer);
    };
  }, [accessToken, isReenqueuing, phase, waitingToken]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextStudentId = digitsOnly(studentId);
    const nextPhoneNumber = digitsOnly(phoneNumber);

    if (!nextStudentId || !nextPhoneNumber) {
      setErrorMessage("학번과 휴대폰 번호를 모두 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const loginPayload = await login({
        studentId: nextStudentId,
        phoneNumber: nextPhoneNumber,
      });
      const enqueuePayload = await enqueue({ accessToken: loginPayload.accessToken });

      setStudentId(nextStudentId);
      setPhoneNumber(nextPhoneNumber);
      setAccessToken(loginPayload.accessToken);
      setWaitingToken(enqueuePayload.waitingToken);
      setQueueRank(0);
      setEstimatedWaitSeconds(0);
      setInitialWaitSeconds(0);
      setStatusMessage("번호표가 발급되었습니다. 잠시 후 대기 상태를 불러옵니다.");
      setPhase("queue");
      setIsReenqueuing(false);
      setReenqueueCountdown(0);
      setFailureReasonCode("");
      setLastUpdatedAt(null);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefresh = () => {
    if (!accessToken || !waitingToken) {
      return;
    }

    refreshQueueStatus();
  };

  const handleCancel = () => {
    resetSession();
    setStatusMessage("");
    setErrorMessage("");
  };

  const lastUpdatedLabel = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "아직 없음";

  return (
    <div className="app">
      <div className="hero">
        <div className="brand-logo" aria-label="유어슈 로고">
          <img className="brand-logo-image" src={yourshoLogo} alt="YOURSHOES 유어슈" />
        </div>
        <p className="hero-title">{eventMeta.title}</p>
        <p className="hero-accent">{eventMeta.accent}</p>
        <p className="hero-sub">{eventMeta.eventName}</p>
      </div>

      {phase === "login" && (
        <section className="card form-card">
          <div className="card-header">대기열 입장</div>
          <p className="form-title">본인 확인 후 번호표를 발급받아주세요.</p>
          <form className="entry-form" onSubmit={handleSubmit}>
            <label className="field" htmlFor="studentId">
              <span className="field-label">학번</span>
              <input
                id="studentId"
                className="field-input"
                inputMode="numeric"
                maxLength={8}
                placeholder="예: 20260101"
                value={studentId}
                onChange={(event) => setStudentId(digitsOnly(event.target.value))}
              />
            </label>
            <label className="field" htmlFor="phoneNumber">
              <span className="field-label">휴대폰 번호</span>
              <input
                id="phoneNumber"
                className="field-input"
                inputMode="tel"
                maxLength={11}
                placeholder="예: 01012345678"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(digitsOnly(event.target.value))}
              />
            </label>
            <button className="btn btn-primary btn-block" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "입장 처리 중..." : "대기열 입장하기"}
            </button>
          </form>
        </section>
      )}

      {phase === "queue" && (
        <>
          <section className="card">
            <div className="card-header">나의 대기순서</div>
            <div className="queue-number">{queueRank.toLocaleString("ko-KR")}</div>
            <div className="progress" aria-label="대기 진행률">
              <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="eta">예상 대기 시간 {formatSeconds(estimatedWaitSeconds)}</div>
            <div className="divider" />
            <div className="stats">
              <div className="stat">
                <span className="stat-label">내 앞 대기 인원</span>
                <span className="stat-value">{formatPeople(waitingAhead)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">번호표 상태</span>
                <span className="stat-value">대기 중</span>
              </div>
              <div className="stat">
                <span className="stat-label">마지막 갱신</span>
                <span className="stat-value">{lastUpdatedLabel}</span>
              </div>
            </div>
          </section>

          <ul className="tips">
            {tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>

          <div className="actions">
            <button className="btn btn-ghost" type="button" onClick={handleCancel}>
              취소
            </button>
            <button className="btn btn-primary" type="button" onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? "확인 중..." : "새로고침"}
            </button>
          </div>
        </>
      )}

      {phase === "processing" && (
        <section className="card draw-card">
          <div className="card-header">{isReenqueuing ? "대기열 재입장 진행 중" : "상품 뽑기 진행 중"}</div>
          <div className="stock-chip">{isReenqueuing ? "새 번호표 발급 중" : "당첨 결과 확인 중"}</div>
          <div className="draw-title">{isReenqueuing ? "다음 회차 입장권 준비 중!" : "두근두근, 상자 흔드는 중!"}</div>
          <div className="draw-machine" aria-hidden="true">
            <div className="draw-orb" />
            <div className="draw-orb draw-orb-delay" />
            <div className="draw-orb draw-orb-delay2" />
          </div>
          <p className="draw-message">
            {isReenqueuing
              ? reenqueueCountdown > 0
                ? `${reenqueueCountdown}초 후 대기열에 다시 진입합니다.`
                : "자격 정보를 유지하고 자동으로 다시 대기열에 입장하고 있어요!"
              : "행운을 섞는 중... 잠시만 기다려주세요!"}
          </p>
        </section>
      )}

      {phase === "success" && (
        <section className="card result-card result-win">
          <div className="card-header">뽑기 결과</div>
          <div className="result-sparkles" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="result-badge">당첨</div>
          <p className="result-title">축하합니다! 상품에 당첨되었어요</p>
          <p className="result-desc">{statusMessage}</p>
          <div className="actions result-actions">
            <button className="btn btn-primary" type="button" onClick={handleCancel}>
              확인
            </button>
          </div>
        </section>
      )}

      {phase === "soldout" && (
        <section className="card result-card result-lose">
          <div className="card-header">이벤트 안내</div>
          <div className="result-badge">종료</div>
          <p className="result-title">준비된 재고가 모두 소진됐어요</p>
          <p className="result-desc">{statusMessage}</p>
          <div className="actions result-actions">
            <button className="btn btn-primary" type="button" onClick={handleCancel}>
              확인
            </button>
          </div>
        </section>
      )}

      {phase === "failed" && (
        <section className="card ended-card">
          <div className="card-header">{failureReasonCode === "LOST" ? "뽑기 결과" : "이벤트 안내"}</div>
          <div className="ended-badge">{failureReasonCode === "LOST" ? "미당첨" : "실패"}</div>
          <p className="ended-title">
            {failureReasonCode === "LOST" ? "아쉽게 이번 회차는 당첨되지 않았어요" : "대기열 처리에 실패했습니다"}
          </p>
          <p className="ended-desc">{statusMessage}</p>
          <div className="actions result-actions">
            <button className="btn btn-primary" type="button" onClick={handleCancel}>
              {failureReasonCode === "LOST" ? "그만하기" : "다시 시작"}
            </button>
          </div>
        </section>
      )}

      {(errorMessage || statusMessage) && (
        <section className={`notice-card ${errorMessage ? "notice-error" : "notice-info"}`}>
          {errorMessage || statusMessage}
        </section>
      )}
    </div>
  );
}

export default App;
