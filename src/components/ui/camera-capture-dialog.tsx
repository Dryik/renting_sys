import { Camera, Loader2, RefreshCcw, Save, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import { useModalBehavior } from "@/hooks/useModalBehavior";

type CameraCaptureDialogProps = {
  customerId: number;
  isBusy?: boolean;
  open: boolean;
  onCancel: () => void;
  onFallbackUpload: () => void;
  onSaved: () => void;
};

type CameraState =
  | "idle"
  | "loading"
  | "ready"
  | "captured"
  | "no_camera"
  | "denied"
  | "unavailable"
  | "unsupported";

export function CameraCaptureDialog({
  customerId,
  isBusy = false,
  onCancel,
  onFallbackUpload,
  onSaved,
  open,
}: CameraCaptureDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [state, setState] = useState<CameraState>("idle");
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: onCancel,
    open,
  });

  useEffect(() => {
    if (!open) {
      stopStream(streamRef.current);
      streamRef.current = null;
      return;
    }

    void initializeCamera();

    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  // Camera setup is intentionally tied to dialog visibility; device changes are handled separately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !selectedDeviceId) {
      return;
    }

    void startStream(selectedDeviceId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedDeviceId]);

  if (!open) {
    return null;
  }

  async function initializeCamera() {
    setState("loading");
    setError(null);
    setCapturedDataUrl(null);

    if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices.getUserMedia) {
      setState("unsupported");
      return;
    }

    try {
      const availableDevices = await navigator.mediaDevices.enumerateDevices();
      const cameras = availableDevices.filter((device) => device.kind === "videoinput");
      setDevices(cameras);

      if (cameras.length === 0) {
        setState("no_camera");
        return;
      }

      const nextDeviceId = selectedDeviceId || cameras[0]?.deviceId || "";
      setSelectedDeviceId(nextDeviceId);
      await startStream(nextDeviceId);
    } catch (err) {
      setCameraError(err);
    }
  }

  async function startStream(deviceId: string) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }

    stopStream(streamRef.current);
    streamRef.current = null;
    setCapturedDataUrl(null);
    setState("loading");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setState("ready");

      const availableDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(availableDevices.filter((device) => device.kind === "videoinput"));
    } catch (err) {
      setCameraError(err);
    }
  }

  function captureFrame() {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError(t("Camera is not ready."));
      return;
    }

    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");

    if (!context) {
      setError(t("Photo could not be captured."));
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedDataUrl(canvas.toDataURL("image/jpeg", 0.86));
    setState("captured");
  }

  async function savePhoto() {
    if (!capturedDataUrl) {
      return;
    }

    setError(null);
    const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId);

    try {
      await window.rentalApp.attachments.saveCapturedPhoto({
        entityType: "customer",
        entityId: customerId,
        imageDataUrl: capturedDataUrl,
        cameraDeviceLabelSnapshot: selectedDevice?.label || null,
        notes: null,
      });
      stopStream(streamRef.current);
      streamRef.current = null;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Photo could not be saved."));
    }
  }

  function setCameraError(err: unknown) {
    stopStream(streamRef.current);
    streamRef.current = null;

    if (err instanceof DOMException) {
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        setState("denied");
        setError(t("Camera permission denied"));
        return;
      }

      if (err.name === "NotReadableError" || err.name === "AbortError") {
        setState("unavailable");
        setError(t("Camera is busy or unavailable"));
        return;
      }

      if (err.name === "OverconstrainedError") {
        setState("unavailable");
        setError(t("Selected camera is unavailable."));
        return;
      }
    }

    setState("unavailable");
    setError(t("Camera is not available."));
  }

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 backdrop-blur-[1px]"
      data-motion="overlay"
    >
      <section
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xl"
        data-motion="dialog"
        data-modal-layer="true"
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-4 border-b bg-muted px-5 py-4">
          <div>
            <h2 className="text-lg font-bold tracking-normal" id={titleId}>
              {t("Take Photo")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("Capture a customer photo with this computer camera.")}</p>
          </div>
          <Button
            aria-label={t("Close")}
            disabled={isBusy}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => {
              stopStream(streamRef.current);
              streamRef.current = null;
              onCancel();
            }}
          >
            <X />
          </Button>
        </header>

        <div className="p-5">
          {devices.length > 1 ? (
            <label className="mb-4 flex flex-col gap-2 text-sm font-medium">
              <span>{t("Camera")}</span>
              <select
                className="h-10 rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]"
                value={selectedDeviceId}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
              >
                {devices.map((device, index) => (
                  <option key={device.deviceId || index} value={device.deviceId}>
                    {device.label || t("Camera {{count}}", { count: index + 1 })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-foreground text-background">
            {state === "ready" || state === "loading" ? (
              <video ref={videoRef} autoPlay className="h-full w-full object-contain" muted playsInline />
            ) : capturedDataUrl ? (
              <img alt={t("Captured photo")} className="h-full w-full object-contain" src={capturedDataUrl} />
            ) : (
              <div className="p-6 text-center text-sm">
                <Camera className="mx-auto mb-3 size-10 opacity-80" />
                <p>{getCameraStateMessage(state, t)}</p>
              </div>
            )}
            {state === "loading" ? (
              <div className="absolute flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm text-foreground shadow">
                <Loader2 className="size-4 animate-spin" />
                {t("Loading...")}
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t(error)}
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t bg-muted px-5 py-4">
          {(state === "no_camera" || state === "denied" || state === "unavailable" || state === "unsupported") ? (
            <>
              <Button disabled={isBusy} type="button" variant="outline" onClick={() => void initializeCamera()}>
                <RefreshCcw />
                {t("Retry")}
              </Button>
              <Button type="button" variant="outline" onClick={onFallbackUpload}>
                <Upload />
                {t("Upload from device")}
              </Button>
            </>
          ) : null}
          {state === "captured" ? (
            <Button disabled={isBusy} type="button" variant="outline" onClick={() => void startStream(selectedDeviceId)}>
              <RefreshCcw />
              {t("Retake")}
            </Button>
          ) : null}
          {state === "ready" ? (
            <Button disabled={isBusy} type="button" onClick={captureFrame}>
              <Camera />
              {t("Capture")}
            </Button>
          ) : null}
          {state === "captured" ? (
            <Button disabled={isBusy} type="button" onClick={() => void savePhoto()}>
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Save />}
              {t("Save Photo")}
            </Button>
          ) : null}
        </footer>
      </section>
    </div>
  );

  return createPortal(dialog, document.body);
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function getCameraStateMessage(state: CameraState, t: (key: string) => string): string {
  if (state === "no_camera") return t("No camera detected");
  if (state === "denied") return t("Camera permission denied");
  if (state === "unsupported") return t("Camera is not available.");
  if (state === "unavailable") return t("Camera is busy or unavailable");
  return t("Camera is not available.");
}
