import { escapeHtml } from '../utils/sanitizers.js';

export class StudyPlayerController {
    constructor(app) {
        this.app = app;

        this.app.studyQueue = [];
        this.app.studyIndex = -1;
        this.app.studyLoop = true;
        this.app.studyPlaybackRate = 1;
        this.app.studyAudio = null;
        this.app.studyAudioUrl = null;

        this.app.licks = Array.isArray(this.app.licks) ? this.app.licks : [];
        this.app.phrases = Array.isArray(this.app.phrases) ? this.app.phrases : [];
    }

    updateStudyLoopButton(btnEl) {
        const btn = btnEl || document.querySelector('[data-action="study-toggle-loop"]');
        if (!btn) return;
        btn.innerHTML = `<i class="fas fa-redo"></i> Loop: ${this.app.studyLoop ? 'ON' : 'OFF'}`;
    }

    renderStudyQueue() {
        const queueEl = document.getElementById('study-queue');
        const titleEl = document.getElementById('study-now-title');
        if (!queueEl) return;

        if (this.app.studyQueue.length === 0) {
            queueEl.innerHTML = '';
            if (titleEl) titleEl.textContent = 'Arrastra un lick aquí';
            return;
        }

        queueEl.innerHTML = this.app.studyQueue.map((item, idx) => {
            const active = idx === this.app.studyIndex;
            return `
                <div class="study-queue-item ${active ? 'active' : ''}">
                    <div class="study-queue-item-title">
                        <strong>${escapeHtml(item.name)}</strong>
                        <small>${escapeHtml(item.style || 'custom')}</small>
                    </div>
                    <div class="study-queue-item-actions">
                        <button class="btn-small" data-action="study-pick" data-index="${idx}">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="btn-small btn-danger" data-action="study-remove" data-index="${idx}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (titleEl) {
            const cur = this.app.studyQueue[this.app.studyIndex] || this.app.studyQueue[0];
            titleEl.textContent = cur ? cur.name : 'Arrastra un lick aquí';
        }
    }

    studyAddById(lickId) {
        const lick = this.app.licks.find(l => l.id === lickId);
        const hasLocalBlob = lick?.audioBlob instanceof Blob;
        if (!lick || (!hasLocalBlob && !lick.audioUrl)) {
            this.app.showNotification('Ese lick no tiene audio', 'info');
            return;
        }

        this.app.studyQueue.push({
            id: lick.id,
            name: lick.name,
            style: lick.style,
            startTime: lick.startTime || 0,
            duration: lick.duration || null,
            audioBlob: hasLocalBlob ? lick.audioBlob : null,
            audioUrl: lick.audioUrl || null
        });

        if (this.app.studyIndex === -1) this.app.studyIndex = 0;
        this.renderStudyQueue();
        this.app.showNotification('Agregado a la cola de estudio', 'success');
    }

    studyRemove(index) {
        if (!Number.isFinite(index)) return;
        if (index < 0 || index >= this.app.studyQueue.length) return;

        this.app.studyQueue.splice(index, 1);
        if (this.app.studyQueue.length === 0) {
            this.app.studyIndex = -1;
            this.studyStop();
        } else {
            if (this.app.studyIndex >= this.app.studyQueue.length) this.app.studyIndex = this.app.studyQueue.length - 1;
        }
        this.renderStudyQueue();
    }

    studyPick(index) {
        if (!Number.isFinite(index)) return;
        if (index < 0 || index >= this.app.studyQueue.length) return;
        this.app.studyIndex = index;
        this.renderStudyQueue();
        this.studyPlay();
    }

    studyClear() {
        this.app.studyQueue = [];
        this.app.studyIndex = -1;
        this.studyStop();
        this.renderStudyQueue();
    }

    studyStop() {
        if (this.app.studyAudio) {
            this.app.studyAudio.pause();
            this.app.studyAudio.currentTime = 0;
            this.app.studyAudio = null;
        }
        if (this.app.studyAudioUrl) {
            if (this.app.studyAudioUrl.startsWith('blob:')) {
                this.app.recording.cleanupObjectURL(this.app.studyAudioUrl);
            }
            this.app.studyAudioUrl = null;
        }
    }

    studyPlay() {
        if (!this.app.studyQueue.length) {
            this.app.showNotification('Arrastra un lick a la cola primero', 'info');
            return;
        }
        if (this.app.studyIndex < 0) this.app.studyIndex = 0;

        const item = this.app.studyQueue[this.app.studyIndex];
        const itemHasBlob = item?.audioBlob instanceof Blob;
        if (!item || (!itemHasBlob && !item.audioUrl)) {
            this.app.showNotification('Este lick no tiene audio disponible', 'info');
            return;
        }

        this.studyStop();

        let url;
        let isObjectUrl = false;
        if (itemHasBlob) {
            url = this.app.recording.createTrackedObjectURL(item.audioBlob);
            isObjectUrl = true;
        } else {
            url = item.audioUrl;
        }
        this.app.studyAudioUrl = url;
        const audio = new Audio(url);
        this.app.studyAudio = audio;

        audio.preload = 'auto';
        audio.playbackRate = this.app.studyPlaybackRate;
        audio.currentTime = Math.max(0, Number(item.startTime) || 0);

        const endAt = item.duration ? Math.max(0.05, Number(item.duration) || 0) : null;
        let stopTimer = null;
        if (endAt) {
            stopTimer = setTimeout(() => {
                try {
                    audio.pause();
                } finally {
                    if (this.app.studyLoop) {
                        this.studyPlay();
                    } else {
                        this.studyNext();
                    }
                }
            }, endAt * 1000);
        }

        audio.onended = () => {
            if (stopTimer) clearTimeout(stopTimer);
            if (this.app.studyLoop) {
                this.studyPlay();
            } else {
                this.studyNext();
            }
        };

        audio.onerror = () => {
            if (stopTimer) clearTimeout(stopTimer);
            this.app.showNotification('Error al reproducir en Study Player', 'error');
            this.studyStop();
            if (isObjectUrl) this.app.recording.cleanupObjectURL(url);
        };

        this.renderStudyQueue();
        audio.play().catch(() => {
            if (stopTimer) clearTimeout(stopTimer);
            this.app.showNotification('No se pudo iniciar reproducción', 'error');
            this.studyStop();
            if (isObjectUrl) this.app.recording.cleanupObjectURL(url);
        });
    }

    studyPause() {
        if (this.app.studyAudio) {
            this.app.studyAudio.pause();
        }
    }

    studyNext() {
        if (!this.app.studyQueue.length) return;
        this.app.studyIndex = (this.app.studyIndex + 1) % this.app.studyQueue.length;
        this.renderStudyQueue();
        this.studyPlay();
    }

    studyPrev() {
        if (!this.app.studyQueue.length) return;
        this.app.studyIndex = (this.app.studyIndex - 1 + this.app.studyQueue.length) % this.app.studyQueue.length;
        this.renderStudyQueue();
        this.studyPlay();
    }
}
