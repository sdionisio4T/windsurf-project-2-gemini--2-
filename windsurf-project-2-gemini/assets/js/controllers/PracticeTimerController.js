import { insertPracticeSession, loadPracticeSessionsRange } from '../modules/SupabaseDataManager.js';
import { logger } from '../utils/logger.js';

export class PracticeTimerController {
    constructor(app) {
        this.app = app;

        this.app.practiceTimerInterval = null;
        this.app.practiceTimerRunning = false;
        this.app.practiceTimerStartMs = 0;
        this.app.practiceTimerElapsedSec = 0;
        this.app.practiceTodayTotalSec = 0;
        this.app.practiceChartDays = null;
        this.app.practiceChartStats = { avg: 0, best: 0 };

        this.app.practiceMilestonesShown = new Set();
        this.app.practiceCelebrationEl = null;
        this.app.practiceCelebrationTimer = null;

        try {
            this.app.navTimerCollapsed = localStorage.getItem('pianostudy-timer-collapsed') === '1';
        } catch {
            this.app.navTimerCollapsed = false;
        }
        try {
            this.app.mobileTimerCollapsed = localStorage.getItem('pianostudy-timer-mobile-collapsed') === '1';
        } catch {
            this.app.mobileTimerCollapsed = false;
        }
    }

    initPracticeTimerWidget() {
        const startBtn = document.getElementById('practice-timer-start');
        const stopBtn = document.getElementById('practice-timer-stop');
        const mobileStartBtn = document.getElementById('mobile-timer-start');
        const mobileStopBtn = document.getElementById('mobile-timer-stop');
        const headerBtn = document.getElementById('nav-timer-header');
        const mobileToggleBtn = document.getElementById('mobile-timer-toggle');

        if (startBtn) startBtn.addEventListener('click', () => this.practiceTimerStart());
        if (stopBtn) stopBtn.addEventListener('click', () => this.practiceTimerStop());
        if (mobileStartBtn) mobileStartBtn.addEventListener('click', () => this.practiceTimerStart());
        if (mobileStopBtn) mobileStopBtn.addEventListener('click', () => this.practiceTimerStop());
        if (headerBtn) headerBtn.addEventListener('click', () => this.toggleNavTimerCollapsed());
        if (mobileToggleBtn) mobileToggleBtn.addEventListener('click', () => this.toggleMobileTimerCollapsed());

        this.updatePracticeTimerUI();
    }

    toggleMobileTimerCollapsed() {
        this.app.mobileTimerCollapsed = !this.app.mobileTimerCollapsed;
        try {
            localStorage.setItem('pianostudy-timer-mobile-collapsed', this.app.mobileTimerCollapsed ? '1' : '0');
        } catch { /* ignore */ }
        this.updatePracticeTimerUI();
    }

    toggleNavTimerCollapsed() {
        this.app.navTimerCollapsed = !this.app.navTimerCollapsed;
        try {
            localStorage.setItem('pianostudy-timer-collapsed', this.app.navTimerCollapsed ? '1' : '0');
        } catch { /* ignore */ }
        this.updatePracticeTimerUI();
    }

    showPracticeCelebration(message) {
        if (!message) return;

        if (!this.app.practiceCelebrationEl) {
            const el = document.createElement('div');
            el.className = 'practice-celebration';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
            this.app.practiceCelebrationEl = el;
        }

        const el = this.app.practiceCelebrationEl;
        el.textContent = message;
        el.classList.remove('is-hiding');
        el.classList.add('is-showing');

        if (this.app.practiceCelebrationTimer) clearTimeout(this.app.practiceCelebrationTimer);
        this.app.practiceCelebrationTimer = setTimeout(() => {
            el.classList.remove('is-showing');
            el.classList.add('is-hiding');
        }, 3000);
    }

    checkPracticeMilestones(totalSeconds) {
        const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
        const milestones = [
            { s: 0, msg: '✅ Sesión iniciada. ¡Vamos!' },
            { s: 10 * 60, msg: '🎹 ¡10 minutos! Buen comienzo, sigue así.' },
            { s: 20 * 60, msg: '🔥 ¡20 minutos! Estás en zona de concentración.' },
            { s: 30 * 60, msg: '⭐ ¡30 minutos! Media hora de práctica pura.' },
            { s: 60 * 60, msg: '🏆 ¡1 HORA! Eso es dedicación de verdad. ¡Excelente sesión!' },
            { s: 2 * 60 * 60, msg: '🎵 ¡2 HORAS! Nivel profesional. Recuerda descansar también.' }
        ];

        for (const m of milestones) {
            if (m.s === 0) continue;
            if (sec === m.s && !this.app.practiceMilestonesShown.has(m.s)) {
                this.app.practiceMilestonesShown.add(m.s);
                this.showPracticeCelebration(m.msg);
            }
        }
    }

    practiceTimerStart() {
        if (!this.app.getActiveUsername()) {
            this.app.showNotification('Inicia sesión para registrar sesiones', 'info');
            return;
        }

        if (this.app.practiceTimerRunning) {
            this.practiceTimerPause();
            return;
        }

        const isResume = this.app.practiceTimerElapsedSec > 0;
        if (!isResume) {
            this.app.practiceMilestonesShown = new Set();
            this.showPracticeCelebration('⏱️ Sesión iniciada. ¡A practicar!');
        }

        this.app.practiceTimerRunning = true;
        this.app.practiceTimerStartMs = Date.now();

        if (this.app.practiceTimerInterval) clearInterval(this.app.practiceTimerInterval);
        this.app.practiceTimerInterval = setInterval(() => {
            this.updatePracticeTimerUI();
        }, 250);

        this.updatePracticeTimerUI();
    }

    practiceTimerPause() {
        if (!this.app.practiceTimerRunning) return;
        const delta = Math.max(0, Math.floor((Date.now() - this.app.practiceTimerStartMs) / 1000));
        this.app.practiceTimerElapsedSec += delta;
        this.app.practiceTimerStartMs = 0;
        this.app.practiceTimerRunning = false;

        if (this.app.practiceTimerInterval) {
            clearInterval(this.app.practiceTimerInterval);
            this.app.practiceTimerInterval = null;
        }
        this.updatePracticeTimerUI();
    }

    async practiceTimerStop() {
        if (!this.app.practiceTimerRunning && this.app.practiceTimerElapsedSec <= 0) return;
        if (!this.app.getActiveUsername()) {
            this.app.practiceTimerRunning = false;
            this.app.practiceTimerElapsedSec = 0;
            this.app.practiceTimerStartMs = 0;
            this.app.practiceMilestonesShown = new Set();
            this.updatePracticeTimerUI();
            return;
        }

        if (!await this.app.showConfirm('¿Terminar sesión y guardar el tiempo?')) return;

        const durationSec = this.getPracticeTimerCurrentSeconds();
        this.app.practiceTimerRunning = false;
        this.app.practiceTimerElapsedSec = 0;
        this.app.practiceTimerStartMs = 0;

        if (this.app.practiceTimerInterval) {
            clearInterval(this.app.practiceTimerInterval);
            this.app.practiceTimerInterval = null;
        }

        const sessionStr = this.formatHMS(durationSec);
        await this.savePracticeSession(durationSec);
        this.showPracticeCelebration(`✅ Sesión terminada. ¡Buen trabajo hoy! (${sessionStr})`);
        this.app.practiceMilestonesShown = new Set();
        this.updatePracticeTimerUI();
    }

    getPracticeTimerCurrentSeconds() {
        const runningDelta = this.app.practiceTimerRunning
            ? Math.max(0, Math.floor((Date.now() - this.app.practiceTimerStartMs) / 1000))
            : 0;
        return Math.max(0, this.app.practiceTimerElapsedSec + runningDelta);
    }

    formatHMS(totalSeconds) {
        const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
        const hh = Math.floor(s / 3600);
        const mm = Math.floor((s % 3600) / 60);
        const ss = s % 60;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }

    updatePracticeTimerUI() {
        const navTimer = document.getElementById('nav-timer');
        const mobileBar = document.getElementById('mobile-timer-bar');

        const timeEl = document.getElementById('practice-timer-time');
        const todayEl = document.getElementById('practice-timer-today');
        const mobileTimeEl = document.getElementById('mobile-timer-time');

        const startBtn = document.getElementById('practice-timer-start');
        const stopBtn = document.getElementById('practice-timer-stop');
        const mobileStartBtn = document.getElementById('mobile-timer-start');
        const mobileStopBtn = document.getElementById('mobile-timer-stop');

        const sec = this.getPracticeTimerCurrentSeconds();
        const timeStr = this.formatHMS(sec);
        const todayStr = this.formatHMS(this.app.practiceTodayTotalSec);

        if (timeEl) timeEl.textContent = timeStr;
        if (todayEl) todayEl.textContent = todayStr;
        if (mobileTimeEl) mobileTimeEl.textContent = timeStr;

        const mobileTimeStripEl = document.getElementById('mobile-timer-time-strip');
        if (mobileTimeStripEl) mobileTimeStripEl.textContent = timeStr;

        if (navTimer) navTimer.classList.toggle('is-running', this.app.practiceTimerRunning);
        if (navTimer) navTimer.classList.toggle('is-collapsed', !!this.app.navTimerCollapsed);
        if (mobileBar) mobileBar.classList.toggle('is-running', this.app.practiceTimerRunning);
        if (mobileBar) mobileBar.classList.toggle('is-collapsed', !!this.app.mobileTimerCollapsed);

        if (this.app.practiceTimerRunning) {
            this.checkPracticeMilestones(sec);
        }

        const canUse = !!this.app.getActiveUsername();
        const canStart = canUse && !this.app.practiceTimerRunning;
        const canStop = canUse && (this.app.practiceTimerRunning || this.app.practiceTimerElapsedSec > 0);

        if (startBtn) startBtn.disabled = !canStart;
        if (stopBtn) stopBtn.disabled = !canStop;
        if (mobileStartBtn) mobileStartBtn.disabled = !canStart;
        if (mobileStopBtn) mobileStopBtn.disabled = !canStop;

        if (startBtn) startBtn.textContent = this.app.practiceTimerRunning ? '⏸' : '▶';
        if (mobileStartBtn) mobileStartBtn.textContent = this.app.practiceTimerRunning ? '⏸' : '▶';
    }

    getTodayDateStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    getPendingPracticeKey() {
        return this.app.userKey('pianostudy-pending-practice-session');
    }

    savePendingPracticeSession() {
        if (!this.app.getActiveUsername()) return;
        if (!this.app.practiceTimerRunning) return;

        const durationSec = this.getPracticeTimerCurrentSeconds();
        if (durationSec <= 0) return;

        const payload = {
            duration_seconds: durationSec,
            date: this.getTodayDateStr(),
            created_at_ms: Date.now()
        };

        try {
            localStorage.setItem(this.getPendingPracticeKey(), JSON.stringify(payload));
        } catch {
            // ignore
        }
    }

    async flushPendingPracticeSession() {
        if (!this.app.getActiveUsername()) return;
        const key = this.getPendingPracticeKey();
        let payload = null;
        try {
            const raw = localStorage.getItem(key);
            if (raw) payload = JSON.parse(raw);
        } catch {
            payload = null;
        }
        if (!payload) return;

        const duration = Math.max(0, Math.floor(Number(payload.duration_seconds) || 0));
        const date = typeof payload.date === 'string' ? payload.date : this.getTodayDateStr();
        if (duration <= 0) {
            localStorage.removeItem(key);
            return;
        }

        const { error } = await insertPracticeSession({ duration_seconds: duration, date });
        if (!error) {
            localStorage.removeItem(key);
            await this.refreshPracticeTotals();
            if (document.getElementById('progress')?.classList.contains('active')) {
                this.app.renderProgressSection();
            }
        }
    }

    async savePracticeSession(durationSec) {
        const sec = Math.max(0, Math.floor(Number(durationSec) || 0));
        if (sec <= 0) return;

        const { error } = await insertPracticeSession({
            duration_seconds: sec,
            date: this.getTodayDateStr()
        });

        if (error) {
            logger.error('insertPracticeSession error:', error);
            this.app.showNotification('No se pudo guardar la sesión', 'error');
            return;
        }

        this.app.progressTracker.addStudyTime(sec);
        this.app.progressTracker.checkAndUpdateStreak();
        this.app.checkBadgeUpgrades();

        await this.refreshPracticeTotals();
        if (document.getElementById('progress')?.classList.contains('active')) {
            this.app.renderProgressSection();
        }
        this.app.showNotification('Sesión guardada', 'success');
    }

    async refreshPracticeTotals() {
        if (!this.app.getActiveUsername()) {
            this.app.practiceTodayTotalSec = 0;
            this.updatePracticeTimerUI();
            return;
        }

        const today = this.getTodayDateStr();
        const { data, error } = await loadPracticeSessionsRange({ fromDate: today, toDate: today });
        if (error) {
            logger.error('loadPracticeSessionsRange error:', error);
            return;
        }
        const total = (data || []).reduce((acc, row) => acc + (Number(row?.duration_seconds) || 0), 0);
        this.app.practiceTodayTotalSec = Math.max(0, Math.floor(total));
        this.updatePracticeTimerUI();
    }
}
