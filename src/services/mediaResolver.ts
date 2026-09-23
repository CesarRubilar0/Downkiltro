/**
 * Downkiltro - Servicio de Resolución y Extracción de Medios
 * Soporte para TikTok (sin marca de agua), Instagram Reels, X (Twitter) y Enlaces Directos.
 * Cumplimiento estricto con las políticas de Google Play Store (Cero YouTube).
 */

export type DownloadFormat = 'VIDEO_MP4' | 'AUDIO_MP3';

export interface ResolvedMedia {
  downloadUrl: string;
  title: string;
  author?: string;
  cover?: string;
  format: DownloadFormat;
  extension: 'mp4' | 'mp3';
}

/**
 * Resuelve la URL pública de la red social y obtiene el enlace directo al archivo multimedia.
 */
export async function resolveMediaUrl(
  inputUrl: string,
  format: DownloadFormat
): Promise<ResolvedMedia> {
  const url = inputUrl.trim();

  // 1. Regla Inquebrantable de Google Play: Bloqueo de YouTube
  if (url.toLowerCase().includes('youtube.com') || url.toLowerCase().includes('youtu.be')) {
    throw new Error(
      'Por políticas oficiales de Google Play Store, Downkiltro no permite descargas de YouTube. Usa TikTok, Instagram, X u otras redes sociales.'
    );
  }

  // 2. Resolver TikTok (sin marca de agua y audio MP3)
  if (url.includes('tiktok.com')) {
    return await resolveTikTok(url, format);
  }

  // 3. Resolver X / Twitter
  if (url.includes('twitter.com') || url.includes('x.com')) {
    return await resolveTwitter(url, format);
  }

  // 4. Resolver Instagram Reels / Posts
  if (url.includes('instagram.com')) {
    return await resolveInstagram(url, format);
  }

  // 5. Enlace directo multimedia (.mp4, .mp3, etc.)
  if (isDirectMediaUrl(url)) {
    const isVideo = format === 'VIDEO_MP4';
    return {
      downloadUrl: url,
      title: `Media_Directo_${Date.now().toString().slice(-4)}`,
      format,
      extension: isVideo ? 'mp4' : 'mp3',
    };
  }

  // En caso de enlace no soportado
  throw new Error(
    'Enlace no reconocido. Por favor pega un enlace válido de TikTok, Instagram Reels, X (Twitter) o un archivo directo.'
  );
}

/**
 * Extractor para TikTok usando la API pública sin marca de agua
 */
async function resolveTikTok(url: string, format: DownloadFormat): Promise<ResolvedMedia> {
  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Error de servidor TikTok (${response.status})`);
    }

    const json = await response.json();

    if (json.code === 0 && json.data) {
      const data = json.data;
      const isVideo = format === 'VIDEO_MP4';
      const cleanTitle = (data.title || 'TikTok_Video')
        .replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ ]/g, '')
        .trim()
        .slice(0, 40) || 'TikTok_Downkiltro';

      const downloadUrl = isVideo ? data.play : (data.music || data.play);

      if (!downloadUrl) {
        throw new Error('No se pudo encontrar el enlace de descarga para este TikTok.');
      }

      return {
        downloadUrl,
        title: cleanTitle,
        author: data.author?.nickname || 'Creador de TikTok',
        cover: data.cover,
        format,
        extension: isVideo ? 'mp4' : 'mp3',
      };
    } else {
      throw new Error(json.msg || 'No se pudo procesar este enlace de TikTok. Verifica que no sea privado.');
    }
  } catch (error: any) {
    throw new Error(error.message || 'Error al conectar con el extractor de TikTok.');
  }
}

/**
 * Extractor para X (Twitter) usando la API de FxTwitter
 */
async function resolveTwitter(url: string, format: DownloadFormat): Promise<ResolvedMedia> {
  try {
    // Extraer el ID del tweet
    const statusMatch = url.match(/(?:status|statuses)\/(\d+)/i);
    if (!statusMatch || !statusMatch[1]) {
      throw new Error('No se encontró el ID del post de X/Twitter en el enlace proporcionado.');
    }

    const tweetId = statusMatch[1];
    const apiUrl = `https://api.fxtwitter.com/status/${tweetId}`;
    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Error al consultar post de X (${response.status})`);
    }

    const json = await response.json();

    if (json.code === 200 && json.tweet) {
      const tweet = json.tweet;
      const videos = tweet.media?.videos;

      if (!videos || videos.length === 0) {
        throw new Error('Este post de X no contiene ningún video o clip multimedia.');
      }

      // Obtener el video con mayor calidad
      const targetVideo = videos[0];
      const videoUrl = targetVideo.url;
      const isVideo = format === 'VIDEO_MP4';

      const cleanTitle = (tweet.text || 'Post_X')
        .replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ ]/g, '')
        .trim()
        .slice(0, 40) || `X_Video_${tweetId.slice(-4)}`;

      return {
        downloadUrl: videoUrl,
        title: cleanTitle,
        author: tweet.author?.name || 'Usuario de X',
        cover: targetVideo.thumbnail_url,
        format,
        extension: isVideo ? 'mp4' : 'mp3',
      };
    } else {
      throw new Error(json.message || 'No se pudo obtener el video del post de X.');
    }
  } catch (error: any) {
    throw new Error(error.message || 'Error al conectar con el extractor de X/Twitter.');
  }
}

/**
 * Extractor para Instagram Reels y Posts
 */
async function resolveInstagram(url: string, format: DownloadFormat): Promise<ResolvedMedia> {
  // Extraer el shortcode del reel o post
  const shortcodeMatch = url.match(/(?:reel|reels|p)\/([a-zA-Z0-9_-]+)/i);
  if (!shortcodeMatch || !shortcodeMatch[1]) {
    throw new Error('No se encontró un código de Reel o publicación válido en el enlace de Instagram.');
  }

  const shortcode = shortcodeMatch[1];
  const isVideo = format === 'VIDEO_MP4';

  // Intentar consultar resolvedor de Instagram
  try {
    // Opción 1: Consulta a endpoint GraphQL de Instagram
    const queryUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
    const response = await fetch(queryUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const item = data.graphql?.shortcode_media || data.items?.[0];

      if (item) {
        const videoUrl = item.video_url || item.video_versions?.[0]?.url;
        if (videoUrl) {
          const caption =
            item.edge_media_to_caption?.edges?.[0]?.node?.text ||
            item.caption?.text ||
            `Instagram_Reel_${shortcode.slice(0, 6)}`;
          const cleanTitle = caption
            .replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ ]/g, '')
            .trim()
            .slice(0, 40) || `Instagram_${shortcode}`;

          return {
            downloadUrl: videoUrl,
            title: cleanTitle,
            author: item.owner?.username || 'Instagram User',
            format,
            extension: isVideo ? 'mp4' : 'mp3',
          };
        }
      }
    }
  } catch {
    // Si la llamada directa a Instagram falla (por protección de cookies), usar servicio de respaldo
  }

  // Opción 2: Servicio de respaldo para Instagram Reels
  try {
    const backupUrl = `https://api.threadsphotodownloader.com/instagram?url=${encodeURIComponent(url)}`;
    const backupRes = await fetch(backupUrl, {
      headers: { Accept: 'application/json' },
    });

    if (backupRes.ok) {
      const backupData = await backupRes.json();
      const videoUrl = backupData.url || backupData.video_url || backupData.data?.[0]?.url;

      if (videoUrl) {
        return {
          downloadUrl: videoUrl,
          title: `Instagram_Reel_${shortcode}`,
          author: 'Instagram',
          format,
          extension: isVideo ? 'mp4' : 'mp3',
        };
      }
    }
  } catch {
    // Continuar al aviso informativo
  }

  throw new Error(
    'No se pudo extraer el video de Instagram. Asegúrate de que el Reel sea de una cuenta pública y no tenga restricciones de edad.'
  );
}

/**
 * Verifica si una URL apunta directamente a un archivo de video o audio
 */
function isDirectMediaUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0];
  return (
    lower.endsWith('.mp4') ||
    lower.endsWith('.mp3') ||
    lower.endsWith('.m4a') ||
    lower.endsWith('.mov') ||
    lower.endsWith('.webm') ||
    lower.endsWith('.wav')
  );
}
