# PianoStudy - Aplicación de Estudio para Pianistas

Una aplicación web especializada para pianistas que permite grabar sesiones de práctica, gestionar licks personales y descubrir nuevos artistas para mejorar la improvisación.

## 🎹 Características Principales

### 🎙️ Sistema de Grabación Avanzado
- **Detección automática de dispositivos de audio**
- **Selector manual de micrófono** (USB, interfaz de audio, integrado)
- **Visualización en tiempo real** con waveform y medidores de nivel
- **Grabación de alta calidad** con control total
- **Modo con backing track** para practicar con acompañamiento

### 🎵 Gestión de Licks
- **Biblioteca personal de licks** específicos para piano
- **Categorización por estilo musical**:
  - Blues
  - Bebop
  - Hard-bop
  - Latin Jazz
  - Son Cubano
  - Bolero
  - Jazz Colombiano
- **Sistema de recomendaciones** para práctica diaria

### ✂️ Editor de Frases Musicales
- **Recorte inteligente** de grabaciones
- **Guardado automático** de frases destacadas
- **Organización por estilo y dificultad**
- **Análisis de progresiones armónicas**

### 🎨 Centro de Descubrimiento Musical
- **Artistas recomendados** por estilo con discografía
- **Playlists de estudio** especializadas
- **Recursos de aprendizaje** para cada género

### 🎯 Diseño RPM-Style
- **Interfaz oscura** con colores vibrantes
- **Diseño responsivo** para todos los dispositivos
- **Visualizadores dinámicos** de audio
- **Navegación intuitiva** tipo programador

## 🚀 Cómo Usar

### 1. Configuración Inicial
1. Abre la aplicación en tu navegador
2. Conecta tu dispositivo de audio (micrófono USB, interfaz, etc.)
3. Selecciona el dispositivo de audio en el selector

### 2. Sesión de Estudio
1. **Elige un lick** de tu biblioteca o agrégalo nuevo
2. **Configura el backing track** si deseas practicar con acompañamiento
3. **Inicia la grabación** y practica
4. **Marca frases destacadas** durante la sesión

### 3. Descubrimiento Musical
1. Explora la sección de **Artistas Recomendados**
2. Filtra por tu estilo preferido
3. Accede a discografía y recursos
4. Crea playlists personalizadas

## 🎨 Estilos Musicales Soportados

### 🎸 Blues
- **Oscar Peterson** - Maestro del swing y blues piano
- **Bill Evans** - Pionero del jazz modal
- **Herbie Hancock** - Innovador del jazz-funk

### 🎷 Bebop
- **Bud Powell** - Padrino del bebop piano
- **Thelonious Monk** - Genio armónico del bebop
- **McCoy Tyner** - Maestro de las cuartas

### 🥁 Hard-bop
- **Horace Silver** - Funk y gospel en hard-bop
- **Art Blakey** - Leyenda del hard-bop
- **Lee Morgan** - Trompeta del hard-bop

### 🎺 Latin Jazz
- **Chucho Valdés** - Titán del jazz cubano
- **Gonzalo Rubalcaba** - Virtuoso del jazz latino
- **Michel Camilo** - Fusión caribeña-jazz

### 🇨🇺 Son Cubano
- **Rubén González** - Legendario pianista cubano
- **Ibrahim Ferrer** - Voz del Buena Vista
- **Bebo Valdés** - Patriarca del jazz cubano

### 💞 Bolero
- **Ernesto Lecuona** - Compositor cubano clásico
- **Consuelo Velázquez** - Autora de "Bésame Mucho"
- **Armando Manzanero** - Maestro del bolero romántico

### ☕ Jazz Colombiano
- **Edy Martínez** - Pionero del jazz colombiano
- **Antonio Arnedo** - Saxofonista y compositor
- **Alejandro Rivas** - Pianista contemporáneo

## 🛠️ Requisitos Técnicos

### Navegadores Compatibles
- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

### Permisos Necesarios
- **Acceso al micrófono** para grabación
- **Almacenamiento local** para configuración

### Dispositivos de Audio Soportados
- Micrófonos USB
- Interfaces de audio (USB, Thunderbolt)
- Micrófonos integrados
- Micrófonos Bluetooth (limitado)

## 📱 Compatibilidad

### Desktop
- ✅ Windows 10/11
- ✅ macOS 10.15+
- ✅ Linux (Ubuntu 18.04+)

### Móvil
- ✅ iOS 14+ (Safari)
- ✅ Android 10+ (Chrome)
- ✅ Tablets y celulares

## 🔧 Instalación

### Opción 1: Uso Directo
1. Abre `index.html` en tu navegador
2. No requiere instalación

### Opción 2: Servidor Local
```bash
# Clona el repositorio
git clone [repository-url]
cd pianostudy

# Inicia servidor local
python -m http.server 8000
# o con Node.js
npx serve .
```

### Opción 3: Despliegue Web
- Compatible con GitHub Pages
- Compatible con Netlify
- Compatible con Vercel
- Compatible con cualquier hosting estático

## 🎛️ Controles y Atajos

### Grabación
- **Espacio**: Iniciar/Detener grabación
- **R**: Reproducir última grabación

### Navegación
- **Tab**: Navegar entre secciones
- **Enter**: Seleccionar elemento
- **Esc**: Cerrar modales

## ☁️ Supabase — Base de datos y almacenamiento

### Tablas requeridas

Ejecuta el siguiente SQL en el **SQL Editor** de tu proyecto Supabase:

```sql
-- Tabla de licks
create table if not exists licks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  style text default '',
  notes text default '',
  file_path text,
  order_index integer default 0,
  created_at timestamptz default now()
);

-- Tabla de grabaciones
create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  duration integer default 0,
  file_path text not null,
  created_at timestamptz default now()
);

-- Tabla de artistas personalizados
create table if not exists custom_artists (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  style text default '',
  description text default '',
  tags text[] default '{}',
  created_at timestamptz default now()
);

-- Tabla de perfiles (recuperación de contraseña + login por usuario)
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text unique,
  security_question text,
  created_at timestamptz default now()
);

-- Tabla de sesiones de práctica
create table if not exists practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  duration_seconds integer not null default 0,
  date date not null,
  created_at timestamptz default now()
);

-- Row Level Security
alter table licks enable row level security;
alter table recordings enable row level security;
alter table custom_artists enable row level security;
alter table user_profiles enable row level security;
alter table practice_sessions enable row level security;

create policy "usuarios ven sus licks" on licks
  for all using (auth.uid()::text = user_id);

create policy "usuarios ven sus grabaciones" on recordings
  for all using (auth.uid()::text = user_id);

create policy "usuarios ven sus artistas" on custom_artists
  for all using (auth.uid()::text = user_id);

create policy "usuarios gestionan su perfil" on user_profiles
  for all using (auth.uid() = id);

create policy "usuarios ven sus sesiones" on practice_sessions
  for all using (auth.uid() = user_id);

-- Función RPC segura para resolver username → email (sin exponer la tabla)
create or replace function get_email_by_username(p_username text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select email
  from user_profiles
  where lower(username) = lower(p_username)
  limit 1;
$$;

revoke all on function get_email_by_username(text) from public;
grant execute on function get_email_by_username(text) to anon, authenticated;

-- Backfill para usuarios existentes (ejecutar una sola vez)
insert into user_profiles (id, email, username, security_question)
select
  au.id,
  au.email,
  au.raw_user_meta_data->>'username',
  au.raw_user_meta_data->>'securityQuestion'
from auth.users au
where not exists (
  select 1 from user_profiles up where up.id = au.id
)
on conflict (id) do update
  set
    username = excluded.username,
    security_question = excluded.security_question;
```

### Storage bucket

Crea un bucket llamado **`recordings`** en Supabase Storage con **acceso público habilitado**.

Luego ejecuta estas políticas en el SQL Editor para controlar el acceso:

```sql
-- Usuarios autenticados pueden subir a su carpeta
CREATE POLICY "usuarios suben sus archivos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'recordings');

-- Lectura pública para reproducción de audio
CREATE POLICY "lectura publica recordings"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'recordings');
```

### Almacenamiento local (solo preferencias)

Solo se conserva `localStorage` para:
- `pianostudy_metronome` — preferencias del metrónomo
- `pianostudy-analysis-history_*` — historial de análisis IA (local)
- `pianostudy-youtube-phrases_*` — frases de YouTube (local)
- `pianostudy-liked-artists_*` — artistas con like (local)
- `pianostudy-favorite-pieces_*` — piezas favoritas (local)

## 🎯 Roadmap

### Versión 1.0 (Actual)
- ✅ Grabación de audio
- ✅ Visualización en tiempo real
- ✅ Gestión de licks
- ✅ Recomendaciones de artistas
- ✅ Diseño responsivo

### Versión 1.1 (Próximo)
- 🔄 Editor de frases avanzado
- 🔄 Análisis armónico
- 🔄 Metrónomo integrado

### Versión 2.0 (Futuro)
- 📋 Colaboración entre músicos
- 📋 IA para análisis de improvisación
- 📋 Integración con Spotify/Apple Music
- 📋 Comunidades de estudio

## 🐛 Solución de Problemas

### Problemas Comunes

**No se detecta el micrófono:**
- Verifica los permisos del navegador
- Asegúrate de que el dispositivo esté conectado
- Refresca la página y vuelve a intentar

**La grabación no suena:**
- Verifica el nivel de volumen del micrófono
- Asegúrate de haber seleccionado el dispositivo correcto
- Prueba con otro navegador


## 📞 Soporte

### Documentación
- [Wiki del Proyecto](wiki-link)
- [Tutoriales en Video](tutorials-link)
- [FAQ](faq-link)

### Comunidad
- [Discord Server](discord-link)
- [Foro de Discusión](forum-link)
- [GitHub Issues](issues-link)

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🙏 Agradecimientos

- A la comunidad de pianistas de jazz latino
- A los desarrolladores de Web Audio API
- A los artistas que inspiran esta aplicación

---

**¡Feliz práctica y que tu improvisación florezca! 🎹✨**
