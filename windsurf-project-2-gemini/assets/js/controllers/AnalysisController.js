import { escapeHtml, sanitizeFileName } from '../utils/sanitizers.js';
import { AIAnalysisEngine } from '../modules/AIAnalysisEngine.js';
import { AudioAnalyzer } from '../modules/AudioAnalyzer.js';
import { logger } from '../utils/logger.js';

export class AnalysisController {
    constructor(app) {
        this.app = app;

        this.app.audioAnalyzer = this.app.audioAnalyzer || new AudioAnalyzer();
        this.app.aiEngine = null;
        this.app.currentAnalysis = null;
        this.app.analysisHistory = [];
        this.app.currentAnalysisAudioBlob = null;
        this.app.analysisAudioUrl = null;
        this.app.analysisSegmentTimer = null;
        this.app.analysisChat = [];
    }

    initializeAIEngine() {
        this.app.aiEngine = new AIAnalysisEngine();
        this.updateAIStatusIndicator();
    }

    updateAIStatusIndicator() {
        const dot = document.getElementById('ai-status-dot');
        const text = document.getElementById('ai-status-text');

        if (dot) {
            dot.classList.toggle('ai-status-dot--on', true);
            dot.classList.toggle('ai-status-dot--off', false);
        }
        if (text) {
            text.textContent = 'IA Activa';
        }
    }

    async showAnalysisSection() {
        this.app.showSection('ai-analysis');
        this.loadRecordingsForAnalysis();
    }

    loadRecordingsForAnalysis() {
        const select = document.getElementById('analysis-recording-select');
        if (!select) return;

        select.innerHTML = '<option value="">Selecciona una grabación...</option>';

        if (this.app.currentRecording instanceof Blob) {
            const opt = document.createElement('option');
            opt.value = 'current';
            opt.textContent = `Grabación actual (${this.app.formatDuration(this.app.currentRecordingDuration || 0)})`;
            select.appendChild(opt);
        }

        (this.app.tempRecordings || []).forEach((rec) => {
            if (!rec || !(rec.blob instanceof Blob)) return;
            const opt = document.createElement('option');
            opt.value = String(rec.id);
            opt.textContent = `${rec.name} (${this.app.formatDuration(rec.duration || 0)})`;
            select.appendChild(opt);
        });
    }

    getRecordingBlobForAnalysis(selectionValue) {
        if (selectionValue === 'current') {
            return this.app.currentRecording instanceof Blob ? this.app.currentRecording : null;
        }
        const id = Number(selectionValue);
        if (!Number.isFinite(id)) return null;
        const rec = (this.app.tempRecordings || []).find(r => r.id === id);
        return rec?.blob instanceof Blob ? rec.blob : null;
    }

    async startAnalysis() {
        const select = document.getElementById('analysis-recording-select');
        const selection = String(select?.value || '');
        if (!selection) return;

        const audioBlob = this.getRecordingBlobForAnalysis(selection);
        if (!audioBlob) {
            this.app.showNotification('Grabación no encontrada', 'error');
            return;
        }

        const statusEl = document.getElementById('analysis-status');
        const resultsEl = document.getElementById('analysis-results');
        statusEl?.classList.remove('hidden');
        resultsEl?.classList.add('hidden');

        try {
            this.updateAnalysisProgress(15);
            const audioAnalysis = await this.app.audioAnalyzer.analyzeAudio(audioBlob, { enableMidiTranscription: true });
            this.updateAnalysisProgress(55);

            const aiEngine = this.app.aiEngine || new AIAnalysisEngine();
            const aiAnalysis = await aiEngine.analyzePerformance(audioAnalysis, {});
            this.updateAnalysisProgress(80);

            const canvas = document.getElementById('analysis-waveform');
            if (canvas) {
                const audioBuffer = await this.getAudioBuffer(audioBlob);
                this.app.audioAnalyzer.generateAnnotatedWaveform(audioBuffer, canvas);
            }

            this.updateAnalysisProgress(100);

            this.app.currentAnalysis = {
                recordingId: selection,
                recordingName: selection === 'current' ? 'Grabación actual' : `Grabación ${selection}`,
                audioAnalysis,
                aiAnalysis,
                timestamp: Date.now()
            };
            this.app.currentAnalysisAudioBlob = audioBlob;

            statusEl?.classList.add('hidden');
            this.displayAnalysisResults();
        } catch (error) {
            logger.error('Error during analysis:', error);
            statusEl?.classList.add('hidden');
            this.app.showNotification('Error al analizar la grabación', 'error');
        }
    }

    updateAnalysisProgress(percent) {
        const progressBar = document.getElementById('analysis-progress');
        if (progressBar) progressBar.style.width = `${percent}%`;
    }

    async getAudioBuffer(blob) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await blob.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
    }

    displayAnalysisResults() {
        if (!this.app.currentAnalysis) return;
        const { audioAnalysis, aiAnalysis } = this.app.currentAnalysis;

        document.getElementById('analysis-results')?.classList.remove('hidden');

        const tempoBpm = Number(audioAnalysis?.tempo?.bpm || audioAnalysis?.tempo || 0);
        const tempoConfidence = Number(audioAnalysis?.tempo?.confidence || 0);
        const keyName = audioAnalysis?.key?.key || audioAnalysis?.pitch || '--';
        const keyScale = audioAnalysis?.key?.scale || '';
        const keyStrength = Number(audioAnalysis?.key?.strength || 0);
        const dynamic = Number(audioAnalysis?.loudness?.dynamicComplexity || 0);

        document.getElementById('detected-tempo').textContent = `${tempoBpm || '--'} BPM`;
        document.getElementById('detected-key').textContent = `${keyName}${keyScale ? ` ${keyScale}` : ''}`;
        document.getElementById('overall-score').textContent = `${aiAnalysis.overallScore}/10`;
        document.getElementById('recording-duration').textContent = this.app.formatDuration(Math.floor(audioAnalysis.duration));

        const bpmValueEl = document.getElementById('metric-bpm-value');
        const bpmConfBarEl = document.getElementById('metric-bpm-confidence');
        const bpmConfTextEl = document.getElementById('metric-bpm-confidence-text');
        if (bpmValueEl) bpmValueEl.textContent = `${tempoBpm || '--'} BPM`;
        if (bpmConfBarEl) bpmConfBarEl.style.width = `${Math.max(0, Math.min(100, tempoConfidence * 100))}%`;
        if (bpmConfTextEl) bpmConfTextEl.textContent = `Confianza ${(tempoConfidence * 100).toFixed(0)}%`;

        const keyValueEl = document.getElementById('metric-key-value');
        const keyStrengthBarEl = document.getElementById('metric-key-strength');
        const keyStrengthTextEl = document.getElementById('metric-key-strength-text');
        if (keyValueEl) keyValueEl.textContent = `${keyName}${keyScale ? ` ${keyScale}` : ''}`;
        if (keyStrengthBarEl) keyStrengthBarEl.style.width = `${Math.max(0, Math.min(100, keyStrength * 100))}%`;
        if (keyStrengthTextEl) keyStrengthTextEl.textContent = `Fuerza ${(keyStrength * 100).toFixed(0)}%`;

        const dynGaugeEl = document.getElementById('metric-dynamic-gauge');
        const dynTextEl = document.getElementById('metric-dynamic-text');
        if (dynGaugeEl) dynGaugeEl.style.width = `${Math.max(0, Math.min(100, dynamic * 100))}%`;
        if (dynTextEl) dynTextEl.textContent = `Complejidad ${(dynamic || 0).toFixed(2)}`;

        const midiContainer = document.getElementById('midi-notes-container');
        const midiList = document.getElementById('midi-notes-list');
        const midiNotes = Array.isArray(audioAnalysis?.midiNotes) ? audioAnalysis.midiNotes : [];
        if (midiContainer && midiList) {
            if (midiNotes.length > 0) {
                midiContainer.classList.remove('hidden');
                midiList.innerHTML = midiNotes.slice(0, 24).map((n) => {
                    const pitchMidi = Number(n?.pitchMidi ?? n?.pitch ?? 0);
                    const start = Number(n?.startTimeSeconds ?? n?.start ?? 0);
                    const dur = Number(n?.durationSeconds ?? n?.duration ?? 0);
                    const amp = Number(n?.amplitude ?? 0);
                    return `<div class="midi-note-item">MIDI ${escapeHtml(String(Math.round(pitchMidi)))} · ${escapeHtml(start.toFixed(2))}s → ${escapeHtml((start + dur).toFixed(2))}s · amp ${escapeHtml(amp.toFixed(2))}</div>`;
                }).join('');
            } else {
                midiContainer.classList.add('hidden');
                midiList.innerHTML = '';
            }
        }

        const musicalEl = document.getElementById('musical-analysis');
        if (musicalEl) musicalEl.innerHTML = `<p>${escapeHtml(aiAnalysis.musicalAnalysis || '')}</p>`;

        const posEl = document.getElementById('positive-feedback');
        if (posEl) {
            const arr = Array.isArray(aiAnalysis.positiveAspects) ? aiAnalysis.positiveAspects : [];
            posEl.innerHTML = arr.map(aspect => `
                <div class="feedback-item">
                    <div class="feedback-icon">✅</div>
                    <div class="feedback-text">${escapeHtml(aspect)}</div>
                </div>
            `).join('');
        }

        const impEl = document.getElementById('improvement-feedback');
        if (impEl) {
            const arr = Array.isArray(aiAnalysis.areasToImprove) ? aiAnalysis.areasToImprove : [];
            impEl.innerHTML = arr.map(area => `
                <div class="feedback-item improvement">
                    <div class="feedback-icon">💡</div>
                    <div class="feedback-text">${escapeHtml(area)}</div>
                </div>
            `).join('');
        }

        const sugEl = document.getElementById('practice-suggestions');
        if (sugEl) {
            const arr = Array.isArray(aiAnalysis.practiceSuggestions) ? aiAnalysis.practiceSuggestions : [];
            sugEl.innerHTML = arr.map(s => `
                <div class="suggestion-card">
                    <div class="suggestion-title">
                        <i class="fas fa-star"></i>
                        ${escapeHtml(s.title || '')}
                    </div>
                    <div class="suggestion-description">
                        ${escapeHtml(s.description || '')}
                    </div>
                </div>
            `).join('');
        }

        const audioEl = document.getElementById('analysis-audio');
        if (audioEl) {
            if (this.app.analysisAudioUrl) {
                this.app.recording.cleanupObjectURL(this.app.analysisAudioUrl);
                this.app.analysisAudioUrl = null;
            }

            if (this.app.currentAnalysisAudioBlob instanceof Blob) {
                const url = this.app.recording.createTrackedObjectURL(this.app.currentAnalysisAudioBlob);
                this.app.analysisAudioUrl = url;
                audioEl.src = url;
                audioEl.setAttribute('data-object-url', url);
            } else {
                audioEl.removeAttribute('src');
                audioEl.load();
            }
        }

        const startEl = document.getElementById('segment-start');
        const endEl = document.getElementById('segment-end');
        if (startEl && endEl) {
            startEl.value = '0';
            endEl.value = String(Math.max(0, Number(audioAnalysis.duration?.toFixed?.(1) || 0)));
        }

        this.app.analysisChat = [];
        this.renderAnalysisChat();
    }

    saveAnalysis() {
        if (!this.app.currentAnalysis) return;

        this.app.analysisHistory = Array.isArray(this.app.analysisHistory) ? this.app.analysisHistory : [];
        this.app.analysisHistory.unshift(this.app.currentAnalysis);
        this.app.safeSetLocalStorage(this.app.userKey('pianostudy-analysis-history'), this.app.analysisHistory);
        this.renderAnalysisHistory();
        this.persistCurrentAnalysisAudio();
        this.app.showNotification('Análisis guardado', 'success');
    }

    loadAnalysisHistory() {
        if (!this.app.getActiveUsername()) {
            this.app.analysisHistory = [];
            this.renderAnalysisHistory();
            return;
        }
        const stored = this.app.safeGetLocalStorage(this.app.userKey('pianostudy-analysis-history'), []);
        this.app.analysisHistory = Array.isArray(stored) ? stored : [];
        this.renderAnalysisHistory();
    }

    renderAnalysisHistory() {
        const container = document.getElementById('analysis-history-list');
        if (!container) return;

        if (!this.app.getActiveUsername()) {
            container.innerHTML = `<div class="auth-required-banner">
                <p>Inicia sesión para ver tu historial de análisis</p>
                <button class="auth-header-btn auth-header-btn--primary" onclick="document.getElementById('auth-open-login')?.click()">Ingresar</button>
            </div>`;
            return;
        }

        if (!this.app.analysisHistory.length) {
            container.innerHTML = '<p class="no-data">No hay análisis guardados todavía</p>';
            return;
        }

        container.innerHTML = this.app.analysisHistory.map(analysis => {
            const date = new Date(analysis.timestamp);
            const score = analysis.aiAnalysis?.overallScore ?? '--';
            const tempo = Number(analysis.audioAnalysis?.tempo?.bpm || analysis.audioAnalysis?.tempo || 0) || '--';
            return `
                <div class="history-item">
                    <div class="history-header">
                        <div>
                            <div class="history-title">${escapeHtml(analysis.recordingName || 'Grabación')}</div>
                            <div class="history-date">${escapeHtml(date.toLocaleDateString())}</div>
                        </div>
                        <div class="history-actions">
                            <button class="btn-small" data-action="analysis-view" data-id="${escapeHtml(String(analysis.timestamp))}">
                                <i class="fas fa-eye"></i> Ver
                            </button>
                            <button class="btn-small btn-danger" data-action="analysis-delete" data-id="${escapeHtml(String(analysis.timestamp))}">
                                <i class="fas fa-trash"></i> Borrar
                            </button>
                        </div>
                    </div>
                    <div class="history-preview">
                        <span>Puntuación: ${escapeHtml(String(score))}/10</span>
                        <span>Tempo: ${escapeHtml(String(tempo))} BPM</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    async deleteAnalysisEntry(timestamp) {
        const ts = Number(timestamp);
        if (!Number.isFinite(ts)) return;

        const item = (this.app.analysisHistory || []).find(a => Number(a?.timestamp) === ts);
        if (!item) return;

        if (!await this.app.showConfirm('¿Borrar este análisis?')) return;

        try {
            this.app.analysisHistory = (this.app.analysisHistory || []).filter(a => Number(a?.timestamp) !== ts);
            this.app.safeSetLocalStorage(this.app.userKey('pianostudy-analysis-history'), this.app.analysisHistory);

            await this.deleteAnalysisAudioFromDb(ts);

            if (Number(this.app.currentAnalysis?.timestamp) === ts) {
                this.resetAnalysis();
            }

            this.renderAnalysisHistory();
            this.app.showNotification('Análisis borrado', 'success');
        } catch (e) {
            logger.error('deleteAnalysisEntry error:', e);
            this.app.showNotification('No se pudo borrar el análisis', 'error');
        }
    }

    resetAnalysis() {
        document.getElementById('analysis-results')?.classList.add('hidden');
        const select = document.getElementById('analysis-recording-select');
        if (select) select.value = '';
        const btn = document.getElementById('start-analysis-btn');
        if (btn) btn.disabled = true;
        this.app.currentAnalysis = null;
        this.app.currentAnalysisAudioBlob = null;

        const audioEl = document.getElementById('analysis-audio');
        if (audioEl) {
            audioEl.removeAttribute('src');
            audioEl.load();
        }
    }

    async viewHistoricalAnalysis(timestamp) {
        const ts = Number(timestamp);
        if (!Number.isFinite(ts)) return;
        const item = (this.app.analysisHistory || []).find(a => Number(a?.timestamp) === ts);
        if (!item) return;

        this.app.currentAnalysis = item;
        this.app.currentAnalysisAudioBlob = await this.loadAnalysisAudioFromDb(ts);
        this.app.showSection('ai-analysis');
        this.displayAnalysisResults();
    }

    renderAnalysisChat() {
        const container = document.getElementById('analysis-chat-messages');
        if (!container) return;

        if (!this.app.analysisChat.length) {
            container.innerHTML = '<div class="chat-message assistant"><div class="chat-role">IA</div><div class="chat-text">Pregúntame sobre tu interpretación (tempo, dinámica, coordinación, etc.).</div></div>';
            return;
        }

        container.innerHTML = this.app.analysisChat.map(m => {
            const role = m.role === 'user' ? 'Tú' : 'IA';
            const cls = m.role === 'user' ? 'user' : 'assistant';
            return `<div class="chat-message ${cls}"><div class="chat-role">${escapeHtml(role)}</div><div class="chat-text">${escapeHtml(m.text)}</div></div>`;
        }).join('');

        container.scrollTop = container.scrollHeight;
    }

    async sendAnalysisChat() {
        if (!this.app.currentAnalysis) {
            this.app.showNotification('Primero analiza una grabación', 'info');
            return;
        }

        const input = document.getElementById('analysis-chat-input');
        const question = String(input?.value || '').trim();
        if (!question) return;

        this.app.analysisChat.push({ role: 'user', text: question });
        if (input) input.value = '';
        this.renderAnalysisChat();

        const { audioAnalysis, aiAnalysis } = this.app.currentAnalysis;
        const engine = this.app.aiEngine || new AIAnalysisEngine('');
        const answer = await engine.answerQuestion(audioAnalysis, aiAnalysis, question);
        this.app.analysisChat.push({ role: 'assistant', text: String(answer || '') });
        this.renderAnalysisChat();
    }

    playAnalysisSegment() {
        const audioEl = document.getElementById('analysis-audio');
        if (!audioEl || !audioEl.src) {
            this.app.showNotification('No hay audio cargado', 'info');
            return;
        }

        const start = Math.max(0, Number(document.getElementById('segment-start')?.value || 0));
        const end = Math.max(0, Number(document.getElementById('segment-end')?.value || 0));
        if (!(end > start)) {
            this.app.showNotification('El fin debe ser mayor que el inicio', 'info');
            return;
        }

        if (this.app.analysisSegmentTimer) {
            clearInterval(this.app.analysisSegmentTimer);
            this.app.analysisSegmentTimer = null;
        }

        audioEl.currentTime = start;
        audioEl.play().catch(() => {
            this.app.showNotification('No se pudo reproducir el audio', 'error');
        });

        this.app.analysisSegmentTimer = setInterval(() => {
            if (audioEl.currentTime >= end || audioEl.ended) {
                audioEl.pause();
                clearInterval(this.app.analysisSegmentTimer);
                this.app.analysisSegmentTimer = null;
            }
        }, 100);
    }

    openAnalysisDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('pianostudy', 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('analysis_audio')) {
                    db.createObjectStore('analysis_audio', { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async persistCurrentAnalysisAudio() {
        if (!this.app.currentAnalysis || !(this.app.currentAnalysisAudioBlob instanceof Blob)) return;
        const id = Number(this.app.currentAnalysis.timestamp);
        if (!Number.isFinite(id)) return;

        try {
            const db = await this.openAnalysisDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction('analysis_audio', 'readwrite');
                const store = tx.objectStore('analysis_audio');
                store.put({ id, blob: this.app.currentAnalysisAudioBlob });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
            db.close();
        } catch (e) {
            logger.error('Error saving analysis audio to IndexedDB:', e);
        }
    }

    async loadAnalysisAudioFromDb(timestamp) {
        const id = Number(timestamp);
        if (!Number.isFinite(id)) return null;

        try {
            const db = await this.openAnalysisDb();
            const record = await new Promise((resolve, reject) => {
                const tx = db.transaction('analysis_audio', 'readonly');
                const store = tx.objectStore('analysis_audio');
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            db.close();
            return record?.blob instanceof Blob ? record.blob : null;
        } catch (e) {
            logger.error('Error loading analysis audio from IndexedDB:', e);
            return null;
        }
    }

    async deleteAnalysisAudioFromDb(timestamp) {
        const id = Number(timestamp);
        if (!Number.isFinite(id)) return;

        try {
            const db = await this.openAnalysisDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction('analysis_audio', 'readwrite');
                const store = tx.objectStore('analysis_audio');
                store.delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
            db.close();
        } catch (e) {
            logger.error('Error deleting analysis audio from IndexedDB:', e);
        }
    }

    exportAnalysisPDF() {
        if (!this.app.currentAnalysis) return;

        const { recordingName, aiAnalysis, audioAnalysis } = this.app.currentAnalysis;
        const tempo = Number(audioAnalysis?.tempo?.bpm || audioAnalysis?.tempo || 0);
        const key = `${audioAnalysis?.key?.key || audioAnalysis?.pitch || '--'} ${audioAnalysis?.key?.scale || ''}`.trim();
        const dynamic = Number(audioAnalysis?.loudness?.dynamicComplexity || 0);
        const content = `ANÁLISIS DE INTERPRETACIÓN MUSICAL\n\nGrabación: ${recordingName}\nDuración: ${audioAnalysis.duration.toFixed(1)}s\nTempo: ${tempo} BPM\nTonalidad: ${key}\nComplejidad dinámica: ${dynamic.toFixed(2)}\nPuntuación: ${aiAnalysis.overallScore}/10\n\nANÁLISIS MUSICAL:\n${aiAnalysis.musicalAnalysis}\n\nASPECTOS POSITIVOS:\n${(aiAnalysis.positiveAspects || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\nÁREAS DE MEJORA:\n${(aiAnalysis.areasToImprove || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\nSUGERENCIAS DE PRÁCTICA:\n${(aiAnalysis.practiceSuggestions || []).map((s, i) => `${i + 1}. ${s.title}\n   ${s.description}`).join('\n\n')}`;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFileName(`analisis_${recordingName || 'grabacion'}`)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.app.showNotification('Análisis exportado como texto (.txt)', 'success');
    }
}
