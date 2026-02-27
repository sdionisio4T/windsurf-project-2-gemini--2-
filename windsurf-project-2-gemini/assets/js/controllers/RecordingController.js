import { escapeHtml } from '../utils/sanitizers.js';
import { logger } from '../utils/logger.js';
import {
    loadRecordingsFromDB, uploadRecording, getRecordingPublicUrl, deleteRecording,
    ERR_MSG
} from '../modules/SupabaseDataManager.js';

export class RecordingController {
    constructor(app) {
        this.app = app;

        this.app.isRecording = false;
        this.app.isPlaying = false;
        this.app.mediaRecorder = null;
        this.app.audioChunks = [];
        this.app.audioContext = null;
        this.app.analyser = null;
        this.app.microphone = null;
        this.app.backingTrack = null;
        this.app.currentAudio = null;
        this.app.currentPlayingAudio = null;
        this.app.currentStream = null;

        this.app.currentRecordingDuration = null;
        this.app.recordingStartTime = null;
        this.app.recordingTimer = null;

        this.app.tempRecordings = Array.isArray(this.app.tempRecordings) ? this.app.tempRecordings : [];
        this.app.objectURLs = this.app.objectURLs instanceof Set ? this.app.objectURLs : new Set();
    }

    cleanupObjectURL(url) {
        if (this.app.objectURLs.has(url)) {
            URL.revokeObjectURL(url);
            this.app.objectURLs.delete(url);
        }
    }

    createTrackedObjectURL(blob) {
        const url = URL.createObjectURL(blob);
        this.app.objectURLs.add(url);
        return url;
    }

    cleanupContainerObjectURLs(container) {
        if (!container) return;
        container.querySelectorAll?.('audio[data-object-url]').forEach((el) => {
            const url = el.getAttribute('data-object-url');
            if (url) this.cleanupObjectURL(url);
        });
    }

    async initAudioContext() {
        try {
            this.app.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.app.analyser = this.app.audioContext.createAnalyser();
            this.app.analyser.fftSize = 256;

            await this.refreshAudioDevices();
            this.startVisualization();
        } catch (error) {
            logger.error('Error initializing audio context:', error);
        }
    }

    async refreshAudioDevices() {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    stream.getTracks().forEach(track => track.stop());
                });

            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');

            const select = document.getElementById('audio-device');
            select.innerHTML = '<option value="">Usar dispositivo por defecto</option>';

            audioInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Micrófono ${index + 1}`;
                select.appendChild(option);
            });
        } catch (error) {
            logger.error('Error refreshing audio devices:', error);
            const select = document.getElementById('audio-device');
            select.innerHTML = '<option value="">Usar dispositivo por defecto</option>';
        }
    }

    async selectAudioDevice(deviceId) {
        if (!deviceId) return;

        if (this.app.currentStream) {
            this.app.currentStream.getTracks().forEach(track => track.stop());
            this.app.currentStream = null;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: deviceId,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            if (this.app.microphone) {
                this.app.microphone.disconnect();
            }

            this.app.currentStream = stream;

            this.app.microphone = this.app.audioContext.createMediaStreamSource(stream);
            this.app.microphone.connect(this.app.analyser);
        } catch (error) {
            logger.error('Error selecting audio device:', error);
        }
    }

    async toggleRecording() {
        if (this.app.isPlaying) {
            this.app.showNotification('Detén la reproducción antes de grabar', 'info');
            return;
        }

        if (this.app.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const deviceId = document.getElementById('audio-device').value;

            let audioConstraints = {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            };

            if (deviceId) {
                audioConstraints.deviceId = { exact: deviceId };
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: audioConstraints
            });

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            this.app.mediaRecorder = new MediaRecorder(stream, { mimeType });
            this.app.audioChunks = [];
            this.app.recordingStartTime = Date.now();

            this.app.mediaRecorder.ondataavailable = (event) => {
                this.app.audioChunks.push(event.data);
            };

            this.app.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.app.audioChunks, { type: this.app.mediaRecorder.mimeType || 'audio/webm' });
                this.app.currentRecording = audioBlob;
                document.getElementById('play-btn').disabled = false;
                document.getElementById('cut-phrases-btn').disabled = false;
                const analyzeBtn = document.getElementById('analyze-recording-btn');
                if (analyzeBtn) analyzeBtn.disabled = false;

                this.addToTempRecordings(audioBlob);
                this.showRecordingList();
                this.stopRecordingTimer();
            };

            this.app.mediaRecorder.start();
            this.app.isRecording = true;

            document.getElementById('recording-indicator').classList.remove('hidden');
            this.startRecordingTimer();

            const recordBtn = document.getElementById('record-btn');
            recordBtn.classList.add('recording');
            recordBtn.innerHTML = '<i class="fas fa-stop"></i> Detener';

            document.getElementById('stop-btn').disabled = false;
        } catch (error) {
            logger.error('Error starting recording:', error);
            this.app.showNotification('Error al iniciar grabación. Verifica los permisos del micrófono.', 'error');
        }
    }

    stopRecording() {
        const durationSec = this.app.recordingStartTime
            ? Math.max(0, Math.floor((Date.now() - this.app.recordingStartTime) / 1000))
            : 0;

        if (this.app.mediaRecorder && this.app.mediaRecorder.state !== 'inactive') {
            this.app.mediaRecorder.stop();
            this.app.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }

        this.app.isRecording = false;

        document.getElementById('recording-indicator').classList.add('hidden');

        const recordBtn = document.getElementById('record-btn');
        recordBtn.classList.remove('recording');
        recordBtn.innerHTML = '<i class="fas fa-circle"></i> Grabar';

        if (durationSec > 0) {
            this.app.progressTracker.addStudyTime(durationSec);
            this.app.progressTracker.incrementRecordings();
            this.app.progressTracker.checkAndUpdateStreak();
            this.app.checkBadgeUpgrades();
        }
    }

    startRecordingTimer() {
        this.app.recordingTimer = setInterval(() => {
            const elapsed = Date.now() - this.app.recordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const displaySeconds = seconds % 60;

            const timeString = `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
            document.getElementById('recording-time').textContent = timeString;
        }, 100);
    }

    stopRecordingTimer() {
        if (this.app.recordingTimer) {
            clearInterval(this.app.recordingTimer);
            this.app.recordingTimer = null;
        }
    }

    async loadRecordingsFromServer() {
        if (!this.app.getActiveUsername()) return;
        const { data, error } = await loadRecordingsFromDB();
        if (error) {
            logger.error('loadRecordingsFromDB error:', error);
            return;
        }
        const localBlobs = {};
        this.app.tempRecordings.forEach(r => { if (r.blob) localBlobs[r.id] = r.blob; });
        this.app.tempRecordings = (data || []).map(r => ({
            id: r.id,
            name: r.name,
            blob: localBlobs[r.id] || null,
            duration: r.duration,
            filePath: r.file_path,
            uploading: false
        }));
        this.updateTempRecordingsList();
    }

    async addToTempRecordings(audioBlob) {
        if (!this.app.getActiveUsername()) {
            this.updateTempRecordingsList();
            return;
        }
        const duration = Math.floor((Date.now() - this.app.recordingStartTime) / 1000);
        const name = `Grabación ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;

        const localRec = {
            id: `local-${Date.now()}`,
            name,
            blob: audioBlob,
            duration,
            filePath: null,
            uploading: true
        };
        this.app.tempRecordings.unshift(localRec);
        this.updateTempRecordingsList();

        const { data, error } = await uploadRecording(audioBlob, name, duration);
        if (error) {
            logger.error('uploadRecording error:', error);
            localRec.uploading = false;
            localRec.uploadError = true;
            this.updateTempRecordingsList();
            this.app.showNotification('Error al subir grabación. Se guardó localmente.', 'error');
            return;
        }
        const idx = this.app.tempRecordings.indexOf(localRec);
        if (idx !== -1) {
            this.app.tempRecordings[idx] = {
                id: data.id,
                name: data.name,
                blob: audioBlob,
                duration: data.duration,
                filePath: data.file_path,
                uploading: false
            };
        }
        this.updateTempRecordingsList();
        this.app.showNotification('Grabación guardada', 'success');
    }

    updateTempRecordingsList() {
        const container = document.getElementById('temp-recordings');
        const deleteAllBtn = document.getElementById('temp-delete-all-btn');

        if (!this.app.getActiveUsername()) {
            container.innerHTML = `<div class="auth-required-banner">
                <p>Inicia sesión para guardar tu progreso</p>
                <button class="auth-header-btn auth-header-btn--primary" onclick="document.getElementById('auth-open-login')?.click()">Ingresar</button>
            </div>`;
            if (deleteAllBtn) deleteAllBtn.style.display = 'none';
            return;
        }

        if (deleteAllBtn) deleteAllBtn.style.display = this.app.tempRecordings.length > 0 ? '' : 'none';

        if (this.app.tempRecordings.length === 0) {
            container.innerHTML = '<p class="no-recordings">No hay grabaciones aún</p>';
            return;
        }

        container.innerHTML = this.app.tempRecordings.map(recording => `
            <div class="recording-item${recording.uploading ? ' uploading' : ''}">
                <div class="recording-info">
                    <div class="recording-name">${escapeHtml(recording.name)}${recording.uploading ? ' <span class="upload-badge"><i class="fas fa-cloud-upload-alt"></i></span>' : ''}</div>
                    <div class="recording-duration">${this.app.formatDuration(recording.duration)}</div>
                </div>
                <div class="recording-actions">
                    <button class="btn-small" data-action="temp-play" data-id="${recording.id}" ${!recording.blob && !recording.filePath ? 'disabled' : ''}>
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn-small" data-action="temp-stop" data-id="${recording.id}">
                        <i class="fas fa-stop"></i>
                    </button>
                    <button class="btn-small" data-action="temp-edit" data-id="${recording.id}">
                        <i class="fas fa-cut"></i>
                    </button>
                    <button class="btn-small btn-danger" data-action="temp-delete" data-id="${recording.id}" ${recording.uploading ? 'disabled' : ''}>
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    playTempRecording(id) {
        const recording = this.app.tempRecordings.find(r => r.id === id);
        if (!recording) return;

        let url;
        let isObjectUrl = false;
        if (recording.blob instanceof Blob) {
            url = this.createTrackedObjectURL(recording.blob);
            isObjectUrl = true;
        } else if (recording.filePath) {
            url = getRecordingPublicUrl(recording.filePath);
        }
        if (!url) return;

        const audio = new Audio(url);
        audio.play();
        audio.onended = () => {
            if (isObjectUrl) this.cleanupObjectURL(url);
            recording.currentAudio = null;
        };
        recording.currentAudio = audio;
    }

    stopTempRecording(id) {
        const recording = this.app.tempRecordings.find(r => r.id === id);
        if (recording && recording.currentAudio) {
            recording.currentAudio.pause();
            recording.currentAudio.currentTime = 0;
            recording.currentAudio = null;
        }
    }

    playRecording() {
        if (!this.app.currentRecording) return;
        
        // Detener reproducción anterior si existe
        if (this.app.currentAudio) {
            this.app.currentAudio.pause();
            this.app.currentAudio.currentTime = 0;
        }
        
        // Deshabilitar botón de grabar mientras se reproduce
        document.getElementById('record-btn').disabled = true;
        this.app.isPlaying = true;
        
        const url = this.createTrackedObjectURL(this.app.currentRecording);
        this.app.currentAudio = new Audio(url);
        this.app.currentAudio.play();

        this.app.currentAudio.onended = () => {
            this.cleanupObjectURL(url);
            document.getElementById('record-btn').disabled = false;
            this.app.isPlaying = false;
            document.getElementById('play-btn').disabled = false;
            document.getElementById('stop-btn').disabled = true;
        };
        
        this.app.currentAudio.onerror = () => {
            this.cleanupObjectURL(url);
            document.getElementById('record-btn').disabled = false;
            this.app.isPlaying = false;
            this.app.showNotification('Error al reproducir la grabación', 'error');
        };
    }

    stopPlayback() {
        if (this.app.currentAudio) {
            this.app.currentAudio.pause();
            this.app.currentAudio.currentTime = 0;
            document.getElementById('record-btn').disabled = false;
            this.app.isPlaying = false;
        }
    }

    loadBackingTrack(event) {
        const file = event.target.files[0];
        if (file) {
            const url = this.createTrackedObjectURL(file);
            this.app.backingTrack = new Audio(url);
            this.app.backingTrack.onended = () => this.cleanupObjectURL(url);
        }
    }

    playBackingTrack() {
        if (this.app.backingTrack) {
            this.app.backingTrack.play();
        }
    }

    stopBackingTrack() {
        if (this.app.backingTrack) {
            this.app.backingTrack.pause();
            this.app.backingTrack.currentTime = 0;
        }
    }

    startVisualization() {
        if (!this.app.analyser) return;
        
        const canvas = document.getElementById('waveform');
        const ctx = canvas.getContext('2d');
        const bufferLength = this.app.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            requestAnimationFrame(draw);
            
            this.app.analyser.getByteTimeDomainData(dataArray);
            
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#00ff41';
            ctx.beginPath();
            
            const sliceWidth = canvas.width / bufferLength;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * canvas.height / 2;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            
            ctx.stroke();
            
            // Update level meters
            this.updateLevelMeters(dataArray);
        };
        
        draw();
    }

    updateLevelMeters(dataArray) {
        const leftLevel = document.getElementById('left-level');
        const rightLevel = document.getElementById('right-level');
        
        // Simple level calculation
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += Math.abs(dataArray[i] - 128);
        }
        const average = sum / dataArray.length;
        const percentage = Math.min(100, (average / 128) * 100);
        
        leftLevel.style.width = percentage + '%';
        rightLevel.style.width = percentage + '%';
    }

    showRecordingList() {
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h3>Grabación Completada</h3>
            <p>¿Qué quieres hacer con esta grabación?</p>
            <div class="recording-options">
                <button class="btn-primary" data-action="recording-open-editor">
                    <i class="fas fa-cut"></i> Cortar Frases
                </button>
                <button class="btn-small" data-action="modal-close">
                    <i class="fas fa-times"></i> Cerrar
                </button>
            </div>
            <div class="recording-preview">
                <h4>Grabación actual:</h4>
                <audio controls data-src="current-recording"></audio>
            </div>
        `;
        
        document.getElementById('modal').classList.remove('hidden');

        const audioEl = document.querySelector('audio[data-src="current-recording"]');
        if (audioEl && this.app.currentRecording) {
            const url = this.createTrackedObjectURL(this.app.currentRecording);
            audioEl.src = url;
            audioEl.onended = () => this.cleanupObjectURL(url);
        }
    }

    async editTempRecording(id) {
        const recording = this.app.tempRecordings.find(r => r.id === id);
        if (!recording) return;

        if (!recording.blob && recording.filePath) {
            this.app.showNotification('Descargando audio…', 'info');
            try {
                const url = getRecordingPublicUrl(recording.filePath);
                if (!url) throw new Error('No URL');
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                recording.blob = await resp.blob();
            } catch (e) {
                logger.error('editTempRecording download error:', e);
                this.app.showNotification('No se pudo descargar el audio para editar', 'error');
                return;
            }
        }

        if (!recording.blob) {
            this.app.showNotification('El audio no está disponible para editar', 'info');
            return;
        }

        this.app.currentRecording = recording.blob;
        this.app.openPhraseEditor();
    }

    async deleteTempRecording(id) {
        const recording = this.app.tempRecordings.find(r => r.id === id);
        if (!recording) return;

        // If it's a local-only (upload failed) record, just remove from memory
        if (String(id).startsWith('local-') || !recording.filePath) {
            this.app.tempRecordings = this.app.tempRecordings.filter(r => r.id !== id);
            this.updateTempRecordingsList();
            return;
        }

        const { error } = await deleteRecording(id, recording.filePath);
        if (error) {
            this.app.showNotification(ERR_MSG, 'error');
            return;
        }
        this.app.tempRecordings = this.app.tempRecordings.filter(r => r.id !== id);
        this.updateTempRecordingsList();
        this.app.showNotification('Grabación eliminada', 'info');
    }

    async deleteAllTempRecordings() {
        if (this.app.tempRecordings.length === 0) return;
        if (!await this.app.showConfirm(`¿Borrar todas las ${this.app.tempRecordings.length} grabaciones temporales?`)) return;

        const toDelete = [...this.app.tempRecordings];
        for (const rec of toDelete) {
            if (!String(rec.id).startsWith('local-') && rec.filePath) {
                await deleteRecording(rec.id, rec.filePath);
            }
        }
        this.app.tempRecordings = [];
        this.updateTempRecordingsList();
        this.app.showNotification('Todas las grabaciones eliminadas', 'info');
    }
}
