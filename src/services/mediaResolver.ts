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
 * Extractor para Instagram Reels y Posts usando SSR / Bot crawler oficial
 */
async function resolveInstagram(url: string, format: DownloadFormat): Promise<ResolvedMedia> {
  // Extraer el shortcode del reel o post (/reel/XXXXX o /p/XXXXX)
  const shortcodeMatch = url.match(/(?:reel|reels|p)\/([a-zA-Z0-9_-]+)/i);
  if (!shortcodeMatch || !shortcodeMatch[1]) {
    throw new Error('No se encontró un código de Reel o publicación válido en el enlace de Instagram.');
  }

  const shortcode = shortcodeMatch[1];
  const isVideo = format === 'VIDEO_MP4';

  try {
    const targetUrl = `https://www.instagram.com/reel/${shortcode}/`;
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });

    if (response.ok) {
      const html = await response.text();

      // 1. Extraer Título, Autor y Portada
      let title = `Instagram_Reel_${shortcode}`;
      let author = 'Instagram';
      let cover: string | undefined = undefined;

      const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
      const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
      const twitterTitleMatch = html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i);
      const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);

      if (ogImageMatch && ogImageMatch[1]) {
        cover = ogImageMatch[1].replace(/&amp;/g, '&');
      }

      if (twitterTitleMatch && twitterTitleMatch[1]) {
        const rawAuthor = twitterTitleMatch[1].split('•')[0].trim();
        if (rawAuthor) author = rawAuthor.replace(/&#064;/g, '@');
      }

      if (ogTitleMatch && ogTitleMatch[1]) {
        title = ogTitleMatch[1]
          .replace(/&quot;/g, '')
          .replace(/&#xbf;/g, '¿')
          .replace(/&#xe9;/g, 'é')
          .replace(/&#xed;/g, 'í')
          .replace(/&#xfa;/g, 'ú')
          .replace(/&#xf3;/g, 'ó')
          .replace(/&#xe1;/g, 'á')
          .replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ ¿?!]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 45);
      } else if (ogDescMatch && ogDescMatch[1]) {
        title = ogDescMatch[1].slice(0, 40);
      }

      // 2. Extraer URLs multimedia de CDN
      const escapedMatches = html.match(/https?:\\\/\\\/[^"']+\.mp4[^"']*/gi) || [];
      const directMatches = html.match(/https?:\/\/[^"']+\.mp4[^"']*/gi) || [];
      const rawUrls = [...escapedMatches, ...directMatches];

      const cleanUrls = rawUrls
        .map((u) => {
          let clean = u
            .replace(/\\\//g, '/')
            .replace(/\\u0026/g, '&')
            .replace(/&amp;/g, '&')
            .replace(/\\u00253D/gi, '=')
            .replace(/\\u0025/gi, '%');
          clean = clean.split('<')[0].split('\\u003C')[0].split('\\')[0];
          return clean;
        })
        .filter((u) => u.startsWith('http') && u.includes('.mp4'));

      if (cleanUrls.length > 0) {
        let downloadUrl = '';

        if (!isVideo) {
          // Para audio: buscar stream de audio dedicado (m78 / heaac / audio en parámetros)
          const audioUrl = cleanUrls.find((u) => {
            if (u.includes('m78') || u.includes('audio') || u.includes('heaac')) return true;
            const efgMatch = u.match(/efg=([a-zA-Z0-9_\-]+)/);
            if (efgMatch && typeof atob !== 'undefined') {
              try {
                const dec = atob(efgMatch[1].replace(/-/g, '+').replace(/_/g, '/'));
                if (dec.toLowerCase().includes('audio') || dec.toLowerCase().includes('heaac')) {
                  return true;
                }
              } catch {}
            }
            return false;
          });

          // Si hay stream de audio dedicado, usarlo; de lo contrario, el video completo
          downloadUrl = audioUrl || cleanUrls[0];
        } else {
          // Para video: buscar versión progresiva en 720p o alta definición
          const progUrl = cleanUrls.find(
            (u) => u.includes('progressive') || u.includes('720') || u.includes('m86')
          );
          downloadUrl = progUrl || cleanUrls[0];
        }

        return {
          downloadUrl,
          title: title || `Instagram_${shortcode}`,
          author,
          cover,
          format,
          extension: isVideo ? 'mp4' : 'mp3',
        };
      }
    }
  } catch {
    // Si la llamada directa falla por cualquier razón, continuar
  }

  throw new Error(
    'No se pudo extraer el archivo de Instagram. Verifica que el Reel sea de una cuenta pública y no tenga restricciones de edad o privacidad.'
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
