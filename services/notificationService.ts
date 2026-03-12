export class NotificationService {
  private static instance: NotificationService;
  private hasPermission: boolean = false;

  private constructor() {
    this.checkPermission();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private checkPermission() {
    if (!("Notification" in window)) {
      console.warn("This browser does not support desktop notification");
      return;
    }
    
    if (Notification.permission === "granted") {
      this.hasPermission = true;
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        this.hasPermission = permission === "granted";
      });
    }
  }

  public requestPermissionManual() {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then((permission) => {
      this.hasPermission = permission === "granted";
      if (this.hasPermission) {
        this.send("Notifications Enabled", "NeuroNote will now notify you about tasks.");
      }
    });
  }

  public send(title: string, body: string, tag?: string) {
    if (!this.hasPermission) return;

    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SEND_NOTIFICATION',
        payload: { title, body, tag }
      });
    } else {
      try {
        new Notification(title, {
          body,
          icon: 'https://lucide.dev/icons/brain-circuit.svg', // Fallback icon
          tag: tag || 'neuronote-general',
          silent: false
        });
      } catch (e) {
        console.error("Notification Error:", e);
      }
    }
  }

  public scheduleReminder(title: string, body: string, delayMinutes: number) {
    if (!this.hasPermission) {
      this.requestPermissionManual();
      return;
    }

    const delayMs = delayMinutes * 60 * 1000;

    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_REMINDER',
        payload: { title, body, delayMs }
      });
    } else {
      setTimeout(() => {
        this.send(title, body, 'study-reminder');
      }, delayMs);
    }
  }
}