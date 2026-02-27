import { db } from './supabase-client.js';
import { logger } from '../utils/logger.js';

export class AIAnalysisEngine {
    async callGemini(prompt, systemPrompt = null) {
        const { data, error } = await db.functions.invoke('gemini-proxy', {
            body: { prompt, systemPrompt }
        });
        if (error) throw new Error('Error llamando al proxy: ' + error.message);
        if (data?.status !== 200) throw new Error('Error del proxy: ' + JSON.stringify(data?.body));
        return data.body;
    }

    async analyzePerformance(audioAnalysis, recordingMetadata = {}) {
        const prompt = this.buildAnalysisPrompt(audioAnalysis, recordingMetadata);
        try {
            const data = await this.callGemini(prompt);
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const analysis = this.parseAIResponse(text);
            return analysis || this.getFallbackAnalysis(audioAnalysis);
        } catch (error) {
            logger.error('Error calling Gemini API:', error);
            return this.getFallbackAnalysis(audioAnalysis);
        }
    }

    async answerQuestion(audioAnalysis, aiAnalysis, question) {
        const q = String(question || '').trim();
        if (!q) return 'Escribe una pregunta para poder ayudarte.';

        const prompt = this.buildQuestionPrompt(audioAnalysis, aiAnalysis, q);
        try {
            const data = await this.callGemini(prompt);
            const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
            return text || this.getFallbackAnswer(audioAnalysis, aiAnalysis, q);
        } catch (error) {
            logger.error('Error calling Gemini API (Q&A):', error);
            return this.getFallbackAnswer(audioAnalysis, aiAnalysis, q);
        }
    }

    buildAnalysisPrompt(audioAnalysis, metadata) {
        const tempo = audioAnalysis?.tempo || {};
        const key = audioAnalysis?.key || {};
        const loudness = audioAnalysis?.loudness || {};
        const mfcc = Array.isArray(audioAnalysis?.mfcc) ? audioAnalysis.mfcc : [];
        const spectralCentroid = Number(audioAnalysis?.spectralCentroid || 0);
        const rhythmicComplexity = Number(audioAnalysis?.rhythmicComplexity || 0);

        return `Eres un profesor de piano jazz y música afrocubana con 20 años de experiencia docente. 
Tienes conocimiento profundo de:
- Estilos: son cubano, mambo, chachachá, guaguancó, bolero, jazz latino, bebop, blues
- Técnicas pianísticas: montuno, tumbao, voicings de jazz, clave 3-2 y 2-3, comping
- Teoría aplicada: modos (dórico, frigio, lidio), escalas bebop, tensiones y sustituciones de acordes
- Referentes: Chucho Valdés, Gonzalo Rubalcaba, Irakere, Benny Moré, Oscar Peterson, Bill Evans
- Pedagogía: método progresivo, ejercicios técnicos específicos por nivel

MÉTRICAS REALES DEL AUDIO:
- Duración: ${Number(audioAnalysis?.duration || 0).toFixed(1)} segundos
- Tempo: ${Math.round(Number(tempo.bpm || 0))} BPM (confianza: ${(Number(tempo.confidence || 0) * 100).toFixed(0)}%)
- Tonalidad detectada: ${key.key || 'Desconocida'} ${key.scale || ''} (fuerza: ${(Number(key.strength || 0) * 100).toFixed(0)}%)
- Loudness promedio: ${Number(loudness.average || 0).toFixed(2)} dB
- Complejidad dinámica: ${Number(loudness.dynamicComplexity || 0).toFixed(2)} (0=plano, 1=muy dinámico)
- Centroide espectral: ${spectralCentroid.toFixed(0)} Hz
- Variabilidad rítmica: ${rhythmicComplexity.toFixed(2)}
- Coeficientes MFCC (timbre): ${mfcc.slice(0, 5).map(v => Number(v).toFixed(2)).join(', ')}

${metadata.style ? `Estilo musical: ${metadata.style}` : ''}
${metadata.notes ? `Notas del músico: ${metadata.notes}` : ''}

REGLAS DE INTERPRETACIÓN MUSICAL:
- Tempo 50-70 BPM: apropiado para bolero o balada jazz, sugiere trabajar expresión y fraseo cantabile
- Tempo 80-110 BPM: zona de mambo, chachachá o jazz medio, evalúa estabilidad del pulso
- Tempo 120-160 BPM: zona de son cubano animado o bebop, evalúa precisión técnica
- Tempo >160 BPM: territorio rápido, comenta sobre control y claridad de notas
- Si complejidad dinámica < 0.3: la interpretación suena plana, sugiere trabajo en contrastes pp/ff
- Si variabilidad rítmica > 0.4: hay inconsistencia en el pulso, recomienda metrónomo y subdivisión
- Si confianza del tempo < 0.5: no hagas afirmaciones fuertes sobre el ritmo
- Si tonalidad es menor: menciona posibilidades de escala dórica o frigia según el estilo
- Si centroide espectral > 3000 Hz: el sonido es brillante, puede indicar mucho uso del registro agudo
- Si centroide espectral < 1500 Hz: predomina el registro grave, evalúa balance entre manos

Responde estrictamente en JSON con esta estructura:
{
  "overallScore": número 1-10,
  "musicalAnalysis": "párrafo interpretando las métricas en términos musicales humanos y concretos, mencionando estilo y contexto afrocubano/jazz cuando aplique",
  "positiveAspects": ["aspecto específico 1", "aspecto específico 2", "aspecto específico 3"],
  "areasToImprove": ["mejora concreta 1 con ejercicio sugerido", "mejora concreta 2", "mejora concreta 3"],
  "practiceSuggestions": [
    { "title": "nombre del ejercicio", "description": "descripción detallada con BPM, compás y técnica específica" },
    { "title": "nombre del ejercicio", "description": "descripción detallada" }
  ]
}

Reglas de respuesta:
- Sé específico: no digas "practica más" sino "practica el montuno en Fa mayor a 80 BPM"
- Usa vocabulario musical real: articulación, fraseo, voicing, clave, swing, etc.
- Adapta el feedback al estilo detectado o al estilo declarado por el músico
- Responde SOLO con el JSON, sin texto adicional`;
    }

    buildQuestionPrompt(audioAnalysis, aiAnalysis, question) {
        const safeAi = aiAnalysis && typeof aiAnalysis === 'object' ? aiAnalysis : {};
        const positives = Array.isArray(safeAi.positiveAspects) ? safeAi.positiveAspects : [];
        const improve = Array.isArray(safeAi.areasToImprove) ? safeAi.areasToImprove : [];
        const suggestions = Array.isArray(safeAi.practiceSuggestions) ? safeAi.practiceSuggestions : [];
        const tempo = Number(audioAnalysis?.tempo?.bpm || audioAnalysis?.tempo || 0);
        const keyName = audioAnalysis?.key?.key || audioAnalysis?.pitch || 'Desconocida';
        const keyScale = audioAnalysis?.key?.scale || '';
        const loudnessAvg = Number(audioAnalysis?.loudness?.average || audioAnalysis?.loudness?.db || 0);
        const dynamic = Number(audioAnalysis?.loudness?.dynamicComplexity || 0);

        return `Eres un profesor de piano jazz y música afrocubana con 20 años de experiencia.
Tu conocimiento incluye:
- Técnicas: montuno, tumbao, voicings, clave 3-2 y 2-3, comping, walking bass en piano
- Teoría: modos, escalas bebop, tensiones, sustitución de tritono, armonía funcional
- Pedagogía: ejercicios graduales, práctica con metrónomo, análisis de grabaciones
- Referentes: Chucho Valdés, Gonzalo Rubalcaba, Oscar Peterson, Herbie Hancock, Benny Moré

CONTEXTO DE LA SESIÓN:
- Duración grabación: ${(audioAnalysis?.duration ?? 0).toFixed(1)}s
- Tempo detectado: ${tempo} BPM
- Tonalidad estimada: ${keyName} ${keyScale}
- Loudness promedio: ${loudnessAvg.toFixed(1)} dB
- Complejidad dinámica: ${dynamic.toFixed(2)} (0=plano, 1=muy dinámico)

ANÁLISIS PREVIO:
- Puntuación: ${safeAi.overallScore ?? 'N/A'}/10
- Puntos positivos: ${positives.slice(0, 3).join(' | ')}
- Áreas de mejora: ${improve.slice(0, 3).join(' | ')}
- Ejercicios sugeridos: ${suggestions.slice(0, 3).map(s => s?.title).filter(Boolean).join(' | ')}

PREGUNTA DEL ESTUDIANTE:
${question}

INSTRUCCIONES DE RESPUESTA:
- Responde en español, de forma clara y motivadora
- Da pasos concretos y específicos (BPM, compás, nombre de escala, etc.)
- Si la pregunta es sobre ritmo, menciona la clave y el estilo afrocubano si aplica
- Si es sobre armonía, sugiere voicings específicos o progresiones
- Si es sobre técnica, describe la posición de manos y el movimiento
- Máximo 3-4 párrafos, directo al punto
- Si no tienes suficiente contexto, pide al estudiante que especifique el estilo o la pieza`;
    }

    getFallbackAnswer(audioAnalysis, aiAnalysis, question) {
        const q = String(question || '').toLowerCase();
        const tempo = Number(audioAnalysis?.tempo?.bpm || audioAnalysis?.tempo || 0);
        const level = Number(audioAnalysis?.loudness?.dynamicComplexity || 0);
        const score = aiAnalysis?.overallScore;

        if (q.includes('tempo') || q.includes('ritmo') || q.includes('metrónomo') || q.includes('metronomo')) {
            return `Sobre el tempo: te detecté aprox. ${tempo} BPM.\n\nPrueba esto:\n1) Metrónomo en negras a ${Math.round(tempo * 0.8)} BPM (80%) y toca sin parar 2 minutos.\n2) Sube a ${tempo} BPM y repite.\n3) Si te aceleras, cambia el metrónomo a corcheas (subdivide) por 1 minuto.\n\nSi me dices qué parte se te va (inicio/medio/final), te propongo un ejercicio más específico.`;
        }

        if (q.includes('dinam') || q.includes('volumen') || q.includes('fuerte') || q.includes('suave')) {
            const dynHint = level < 0.3
                ? 'La interpretación parece algo plana en dinámicas.'
                : 'Hay variación dinámica aprovechable.';
            return `Sobre dinámica/volumen: ${dynHint}\n\nEjercicio rápido:\n- Toca una misma frase 5 veces: pp, p, mf, f, ff.\n- Mantén el tempo fijo y cambia solo el peso del brazo y la velocidad del ataque.\n\nSi quieres, dime qué estilo estás tocando (blues/bebop/bolero/latin) y ajusto la sugerencia.`;
        }

        return `Puedo ayudarte con esa pregunta.\n\nCon lo que tengo (sin audio), sé que tu grabación dura ${audioAnalysis.duration?.toFixed?.(1) ?? 'N/A'}s, tempo aprox. ${tempo} BPM y score ${score ?? 'N/A'}/10.\n\nPara afinar la respuesta, dime:\n- ¿Qué estabas practicando (tema/lick/estilo)?\n- ¿Qué te salió mal exactamente (tempo, notas, coordinación, swing, voicings, mano izquierda)?`;
    }

    parseAIResponse(text) {
        try {
            const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return JSON.parse(text);
        } catch (error) {
            logger.error('Error parsing AI response:', error);
            return null;
        }
    }

    getFallbackAnalysis(audioAnalysis) {
        const tempoBpm = Number(audioAnalysis?.tempo?.bpm || audioAnalysis?.tempo || 0);
        const dynamic = Number(audioAnalysis?.loudness?.dynamicComplexity || 0);
        const loudnessFeedback = dynamic < 0.3
            ? 'La dinámica suena relativamente plana; conviene ampliar contrastes.'
            : 'Se aprecia una dinámica con cierto movimiento.';
        const tempoFeedback = this.getTempoFeedback(tempoBpm);

        return {
            overallScore: 7,
            musicalAnalysis: `Interpretación de ${audioAnalysis.duration.toFixed(1)} segundos. ${tempoFeedback} ${loudnessFeedback} La grabación muestra elementos técnicos sólidos con espacio para desarrollo expresivo.`,
            positiveAspects: [
                'Mantuviste un tempo relativamente estable durante la interpretación',
                'La claridad en la ejecución de las notas es evidente',
                'Hay control básico de la dinámica'
            ],
            areasToImprove: [
                'Trabajar en mayor variación dinámica para expresividad',
                'Explorar diferentes articulaciones y fraseos',
                'Desarrollar más confianza en el manejo del tempo'
            ],
            practiceSuggestions: [
                {
                    title: 'Practica con metrónomo',
                    description: `Tu tempo de ${tempoBpm} BPM es un buen punto de partida. Practica a diferentes velocidades: 80%, 100% y 120% de este tempo.`
                },
                {
                    title: 'Ejercicios de dinámica',
                    description: 'Toca la misma frase a diferentes volúmenes (pp, p, mf, f, ff) para desarrollar control dinámico.'
                },
                {
                    title: 'Graba y compara',
                    description: 'Graba la misma pieza múltiples veces y compara las interpretaciones para identificar áreas de mejora.'
                }
            ]
        };
    }

    getTempoFeedback(tempo) {
        if (tempo < 60) return 'El tempo es bastante lento, apropiado para baladas.';
        if (tempo < 90) return 'Tempo moderado, bueno para piezas expresivas.';
        if (tempo < 120) return 'Tempo medio, versátil para varios estilos.';
        if (tempo < 150) return 'Tempo animado, adecuado para piezas energéticas.';
        return 'Tempo rápido, desafiante para mantener precisión.';
    }

    getLoudnessFeedback(level) {
        const feedbacks = {
            'Muy fuerte': 'Nivel de volumen muy alto - considera más variación dinámica.',
            'Fuerte': 'Buen nivel de proyección sonora.',
            'Moderado': 'Nivel de volumen equilibrado.',
            'Suave': 'Nivel suave - considera usar más proyección en secciones climáticas.',
            'Muy suave': 'Nivel muy bajo - verifica tu técnica y la grabación.'
        };
        return feedbacks[level] || '';
    }
}
