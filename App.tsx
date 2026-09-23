import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as StoreReview from 'expo-store-review';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { resolveMediaUrl } from './src/services/mediaResolver';

type DownloadFormat = 'VIDEO_MP4' | 'AUDIO_MP3';

interface DownloadItem {
  id: string;
  title: string;
  url: string;
  format: DownloadFormat;
  progress: number;
  speedKbps: number;
  isCompleted: boolean;
  localUri?: string;
}

function MainScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'download' | 'library'>('download');
  const [urlInput, setUrlInput] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<DownloadFormat>('VIDEO_MP4');
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentDownload, setCurrentDownload] = useState<DownloadItem | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Estados para modal de renombrar
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [itemToRename, setItemToRename] = useState<DownloadItem | null>(null);
  const [newTitleInput, setNewTitleInput] = useState('');

  // Lista de medios descargados
  const [libraryItems, setLibraryItems] = useState<DownloadItem[]>([
    {
      id: 'sample-1',
      title: 'TikTok_Audio_Trend',
      url: 'https://tiktok.com/...',
      format: 'AUDIO_MP3',
      progress: 100,
      speedKbps: 0,
      isCompleted: true,
    },
    {
      id: 'sample-2',
      title: 'Reels_Comedia_HD',
      url: 'https://instagram.com/...',
      format: 'VIDEO_MP4',
      progress: 100,
      speedKbps: 0,
      isCompleted: true,
    },
  ]);

  // Pegar enlace desde el portapapeles
  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setUrlInput(text.trim());
      } else {
        Alert.alert('Portapapeles vacío', 'No hay ningún enlace copiado.');
      }
    } catch {
      Alert.alert('Error', 'No se pudo acceder al portapapeles.');
    }
  };

  // Guardar archivo en carpeta pública (Descargas / Mis Archivos)
  const handleSaveToFiles = async (fileUri: string, title: string, format: DownloadFormat) => {
    try {
      const isVideo = format === 'VIDEO_MP4';
      const extension = isVideo ? 'mp4' : 'mp3';
      const mimeType = isVideo ? 'video/mp4' : 'audio/mpeg';
      const cleanFileName = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${extension}`;

      if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
        // Solicitar al usuario que elija la carpeta donde desea guardar en su teléfono
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64Data = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const createdFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            cleanFileName,
            mimeType
          );
          await FileSystem.writeAsStringAsync(createdFileUri, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          Alert.alert(
            '✅ ¡Guardado Exitoso!',
            `El archivo "${cleanFileName}" se guardó correctamente en tu carpeta seleccionada de Mis Archivos / Descargas.`
          );
          return;
        }
      }

      // Fallback seguro a Sharing con título descriptivo si no es Android o canceló el selector
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType,
          dialogTitle: 'Guardar archivo en tu teléfono',
        });
      } else {
        Alert.alert('Aviso', 'El archivo permanece seguro en el almacenamiento de la app.');
      }
    } catch (e) {
      console.warn('Error al guardar en archivos:', e);
      // Fallback secundario
      try {
        await Sharing.shareAsync(fileUri, { dialogTitle: 'Guardar en teléfono' });
      } catch {
        Alert.alert('Error', 'No se pudo guardar el archivo en la carpeta externa.');
      }
    }
  };

  // Compartir directamente por WhatsApp, Telegram, etc.
  const handleShare = async (fileUri: string) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: selectedFormat === 'VIDEO_MP4' ? 'video/mp4' : 'audio/mpeg',
          dialogTitle: 'Compartir video o audio con Downkiltro',
        });
      } else {
        Alert.alert('Aviso', 'El servicio para compartir no está disponible en este dispositivo.');
      }
    } catch (e) {
      console.warn('Error al compartir:', e);
    }
  };

  // Abrir modal de renombrado
  const handleOpenRename = (item: DownloadItem) => {
    setItemToRename(item);
    setNewTitleInput(item.title);
    setRenameModalVisible(true);
  };

  // Guardar nuevo nombre de archivo
  const handleSaveRename = () => {
    if (!itemToRename) return;
    const trimmed = newTitleInput.trim();
    if (!trimmed) {
      Alert.alert('Nombre requerido', 'Por favor ingresa un nombre para el archivo.');
      return;
    }

    setLibraryItems((prev) =>
      prev.map((it) => (it.id === itemToRename.id ? { ...it, title: trimmed } : it))
    );
    if (currentDownload?.id === itemToRename.id) {
      setCurrentDownload((prev) => (prev ? { ...prev, title: trimmed } : null));
    }
    setRenameModalVisible(false);
    setItemToRename(null);
  };

  // Eliminar clip descargado de la biblioteca y almacenamiento
  const handleDeleteItem = (item: DownloadItem) => {
    Alert.alert(
      'Eliminar Archivo',
      `¿Deseas eliminar "${item.title}" de tus descargas?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              if (item.localUri) {
                const info = await FileSystem.getInfoAsync(item.localUri);
                if (info.exists) {
                  await FileSystem.deleteAsync(item.localUri, { idempotent: true });
                }
              }
            } catch (err) {
              console.warn('Error al borrar archivo físico:', err);
            }
            setLibraryItems((prev) => prev.filter((it) => it.id !== item.id));
            if (currentDownload?.id === item.id) {
              setCurrentDownload(null);
            }
          },
        },
      ]
    );
  };

  // Iniciar descarga real con FileSystem
  const handleStartDownload = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      Alert.alert('Enlace requerido', 'Por favor ingresa o pega el enlace del video.');
      return;
    }

    // Regla estricta de Google Play: Bloqueo de YouTube
    if (trimmed.toLowerCase().includes('youtube.com') || trimmed.toLowerCase().includes('youtu.be')) {
      Alert.alert(
        'Aviso de Google Play',
        'Por políticas de la tienda de Google, Downkiltro no permite descargas de YouTube. Usa enlaces de TikTok, Instagram Reels, X u otras redes sociales.'
      );
      return;
    }

    setIsDownloading(true);
    setCurrentDownload({
      id: Date.now().toString(),
      title: 'Extrayendo enlace de la red social...',
      url: trimmed,
      format: selectedFormat,
      progress: 5,
      speedKbps: 0,
      isCompleted: false,
    });

    try {
      // 1. Extraer el video/audio real de TikTok, X o Instagram
      const resolved = await resolveMediaUrl(trimmed, selectedFormat);

      const timestamp = Date.now().toString().slice(-4);
      const safeTitle = (resolved.title || 'Media')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .slice(0, 25);
      const fileName = `${safeTitle}_${timestamp}.${resolved.extension}`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      const activeItem: DownloadItem = {
        id: Date.now().toString(),
        title: resolved.title,
        url: trimmed,
        format: selectedFormat,
        progress: 10,
        speedKbps: 850,
        isCompleted: false,
      };
      setCurrentDownload(activeItem);

      // 2. Descarga real de bytes con callback de progreso
      const downloadResumable = FileSystem.createDownloadResumable(
        resolved.downloadUrl,
        fileUri,
        {},
        (downloadProgress) => {
          const total = downloadProgress.totalBytesExpectedToWrite;
          const written = downloadProgress.totalBytesWritten;
          const percent = total > 0 ? Math.round((written / total) * 100) : 50;

          setCurrentDownload((prev) =>
            prev
              ? {
                  ...prev,
                  progress: percent,
                  speedKbps: Math.floor(Math.random() * (2400 - 1200) + 1200),
                }
              : null
          );
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (result && result.uri) {
        setIsDownloading(false);
        const finishedItem: DownloadItem = {
          ...activeItem,
          progress: 100,
          isCompleted: true,
          localUri: result.uri,
        };
        setCurrentDownload(finishedItem);
        setLibraryItems((prev) => [finishedItem, ...prev]);
        setUrlInput('');

        // Diálogo al finalizar con opciones independientes
        Alert.alert(
          '🎉 ¡Descarga Completa!',
          `Se descargó exitosamente: "${resolved.title}"`,
          [
            { text: 'Listo', style: 'cancel' },
            {
              text: '💾 Guardar en Archivos',
              onPress: () => handleSaveToFiles(result.uri, finishedItem.title, finishedItem.format),
            },
            {
              text: '🔗 Compartir',
              onPress: () => handleShare(result.uri),
            },
          ]
        );

        // Incrementar descargas y evaluar calificación in-app
        setCompletedCount((prevCount) => {
          const newCount = prevCount + 1;
          if (newCount === 2 || newCount === 3) {
            triggerStoreReview();
          }
          return newCount;
        });
      }
    } catch (error: any) {
      setIsDownloading(false);
      setCurrentDownload(null);
      Alert.alert(
        'Aviso de Descarga',
        error.message || 'No se pudo obtener el archivo multimedia. Verifica que el enlace sea público.'
      );
    }
  };

  // Lanzar calificación oficial en Google Play Store
  const triggerStoreReview = async () => {
    try {
      const isAvailable = await StoreReview.isAvailableAsync();
      if (isAvailable) {
        await StoreReview.requestReview();
      }
    } catch (e) {
      console.log('Review no disponible en este entorno');
    }
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar style="light" />

      {/* Cabecera con Logo Centrado y Botón de Ayuda */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 4 }]}>
        {/* Espaciador invisible para balancear y centrar el logo al 100% */}
        <View style={styles.headerSpacer} />

        {/* Logo Centrado */}
        <View style={styles.logoBadgeContainer}>
          <Image
            source={require('./store_assets/logo_downkiltro.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* Botón de Ayuda alineado a la derecha */}
        <TouchableOpacity
          style={styles.helpHeaderButton}
          onPress={() => setShowHelpModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="help-circle" size={26} color="#00E5FF" />
        </TouchableOpacity>
      </View>

      {/* Contenido principal con Scroll independiente */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'download' ? (
          <View style={styles.tabContent}>
            {/* Banner Informativo con enlace a guía */}
            <TouchableOpacity
              style={styles.infoCard}
              onPress={() => setShowHelpModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles" size={22} color="#00E5FF" />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>Descargas Rápidas de Redes Sociales</Text>
                <Text style={styles.infoSub}>
                  TikTok (sin marca de agua), Reels, X y más. Toca aquí para ver cómo se usa.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#00E5FF" />
            </TouchableOpacity>

            {/* Campo de Entrada de URL */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Pega el enlace del video aquí..."
                placeholderTextColor="#7D7D9A"
                value={urlInput}
                onChangeText={setUrlInput}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.pasteButton} onPress={handlePaste} activeOpacity={0.7}>
                <Ionicons name="clipboard-outline" size={18} color="#00E5FF" />
                <Text style={styles.pasteText}>Pegar</Text>
              </TouchableOpacity>
            </View>

            {/* Selector de Formato */}
            <Text style={styles.sectionTitle}>Selecciona el formato:</Text>
            <View style={styles.formatRow}>
              <TouchableOpacity
                style={[
                  styles.formatChip,
                  selectedFormat === 'VIDEO_MP4' && styles.formatChipActive,
                ]}
                onPress={() => setSelectedFormat('VIDEO_MP4')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="videocam"
                  size={20}
                  color={selectedFormat === 'VIDEO_MP4' ? '#00E5FF' : '#A0A0C0'}
                />
                <Text
                  style={[
                    styles.formatText,
                    selectedFormat === 'VIDEO_MP4' && styles.formatTextActive,
                  ]}
                >
                  Video MP4 (HD)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.formatChip,
                  selectedFormat === 'AUDIO_MP3' && styles.formatChipActive,
                ]}
                onPress={() => setSelectedFormat('AUDIO_MP3')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="musical-notes"
                  size={20}
                  color={selectedFormat === 'AUDIO_MP3' ? '#00E5FF' : '#A0A0C0'}
                />
                <Text
                  style={[
                    styles.formatText,
                    selectedFormat === 'AUDIO_MP3' && styles.formatTextActive,
                  ]}
                >
                  Audio MP3
                </Text>
              </TouchableOpacity>
            </View>

            {/* Botón Principal de Descarga */}
            <TouchableOpacity
              style={[styles.downloadButton, isDownloading && styles.downloadButtonDisabled]}
              onPress={handleStartDownload}
              disabled={isDownloading}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isDownloading ? 'sync' : 'arrow-down-circle'}
                size={24}
                color="#12121A"
              />
              <Text style={styles.downloadButtonText}>
                {isDownloading ? 'Descargando archivo...' : 'Iniciar Descarga'}
              </Text>
            </TouchableOpacity>

            {/* Tarjeta de Progreso en Vivo */}
            {currentDownload && (
              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle} numberOfLines={1}>
                    {currentDownload.title}
                  </Text>
                  <Text
                    style={[
                      styles.progressStatus,
                      currentDownload.isCompleted && styles.progressStatusCompleted,
                    ]}
                  >
                    {currentDownload.isCompleted ? '¡Descargado!' : `${currentDownload.progress}%`}
                  </Text>
                </View>

                {/* Barra de progreso */}
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${currentDownload.progress}%` },
                      currentDownload.isCompleted && styles.progressBarCompleted,
                    ]}
                  />
                </View>

                <View style={styles.progressFooter}>
                  <Text style={styles.progressFormat}>
                    {currentDownload.format === 'VIDEO_MP4' ? 'MP4 • Alta Definición' : 'MP3 • 320 kbps'}
                  </Text>
                  {!currentDownload.isCompleted && (
                    <Text style={styles.progressSpeed}>{currentDownload.speedKbps} KB/s</Text>
                  )}
                </View>

                {/* BOTONES SEPARADOS: Guardar en Archivos y Compartir */}
                {currentDownload.isCompleted && currentDownload.localUri && (
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity
                      style={styles.saveFileBtn}
                      onPress={() =>
                        handleSaveToFiles(
                          currentDownload.localUri!,
                          currentDownload.title,
                          currentDownload.format
                        )
                      }
                      activeOpacity={0.8}
                    >
                      <Ionicons name="save-outline" size={18} color="#12121A" />
                      <Text style={styles.saveFileBtnText}>Guardar en Archivos</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.shareBtn}
                      onPress={() => handleShare(currentDownload.localUri!)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="share-social" size={18} color="#00E5FF" />
                      <Text style={styles.shareBtnText}>Compartir</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Botón de Calificación en Google Play */}
            <TouchableOpacity style={styles.reviewButton} onPress={triggerStoreReview} activeOpacity={0.8}>
              <Ionicons name="star" size={20} color="#FFD700" />
              <Text style={styles.reviewText}>Calificar Downkiltro en Google Play</Text>
            </TouchableOpacity>

            {/* Descargo de Responsabilidad Normativo */}
            <Text style={styles.disclaimer}>
              Downkiltro no está afiliada ni permite descargas de YouTube de conformidad con las políticas de Google Play.
            </Text>
          </View>
        ) : (
          /* Pestaña: Mis Medios (Biblioteca) */
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Archivos Descargados ({libraryItems.length})</Text>
            {libraryItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={54} color="#35354E" />
                <Text style={styles.emptyStateTitle}>No tienes descargas aún</Text>
                <Text style={styles.emptyStateSub}>
                  Pega un enlace en la pestaña "Descargar" para guardar tu primer video o audio.
                </Text>
              </View>
            ) : (
              libraryItems.map((item) => (
                <View key={item.id} style={styles.mediaCard}>
                  <View style={styles.mediaIconBox}>
                    <Ionicons
                      name={item.format === 'VIDEO_MP4' ? 'videocam' : 'headset'}
                      size={24}
                      color="#00E5FF"
                    />
                  </View>
                  <View style={styles.mediaInfo}>
                    <Text style={styles.mediaTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.mediaSub}>
                      {item.format === 'VIDEO_MP4' ? 'Video MP4 • Listo' : 'Audio MP3 • Listo'}
                    </Text>
                  </View>

                  {/* Acciones individuales: Guardar, Compartir, Renombrar, Eliminar */}
                  <View style={styles.mediaItemActions}>
                    <TouchableOpacity
                      style={styles.mediaSmallBtn}
                      onPress={() => {
                        if (item.localUri) {
                          handleSaveToFiles(item.localUri, item.title, item.format);
                        } else {
                          Alert.alert('Archivo listo', `Descarga un archivo real para guardarlo en tu teléfono.`);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="save-outline" size={17} color="#00E5FF" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.mediaSmallBtn}
                      onPress={() => {
                        if (item.localUri) {
                          handleShare(item.localUri);
                        } else {
                          Alert.alert('Archivo listo', `${item.title} está listo para reproducir.`);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="share-social-outline" size={17} color="#00E5FF" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.mediaSmallBtn, styles.mediaRenameBtn]}
                      onPress={() => handleOpenRename(item)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil-outline" size={17} color="#FFD700" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.mediaSmallBtn, styles.mediaDeleteBtn]}
                      onPress={() => handleDeleteItem(item)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={17} color="#FF5252" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal: ¿Cómo se usa Downkiltro? */}
      <Modal
        visible={showHelpModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowHelpModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Ionicons name="book-outline" size={24} color="#00E5FF" />
                <Text style={styles.modalTitle}>¿Cómo se usa Downkiltro?</Text>
              </View>
              <TouchableOpacity onPress={() => setShowHelpModal(false)}>
                <Ionicons name="close" size={24} color="#A0A0C0" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Paso 1 */}
              <View style={styles.helpStep}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>1</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Copia el enlace del video</Text>
                  <Text style={styles.stepDesc}>
                    Abre TikTok, Instagram, X u otra app. Toca "Compartir" y selecciona "Copiar enlace".
                  </Text>
                </View>
              </View>

              {/* Paso 2 */}
              <View style={styles.helpStep}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>2</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Pega en Downkiltro</Text>
                  <Text style={styles.stepDesc}>
                    Regresa a Downkiltro y presiona el botón azul "Pegar" para insertar el enlace al instante.
                  </Text>
                </View>
              </View>

              {/* Paso 3 */}
              <View style={styles.helpStep}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>3</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Elige Video MP4 o Audio MP3</Text>
                  <Text style={styles.stepDesc}>
                    Selecciona Video MP4 (para ver con imagen) o Audio MP3 (para escuchar solo el sonido o música).
                  </Text>
                </View>
              </View>

              {/* Paso 4 */}
              <View style={styles.helpStep}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>4</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>¡Descarga, Guarda o Comparte!</Text>
                  <Text style={styles.stepDesc}>
                    Toca "Iniciar Descarga". Cuando termine, usa "Guardar en Archivos" para archivarlo en Descargas/Mis Archivos, o "Compartir" para enviarlo por WhatsApp.
                  </Text>
                </View>
              </View>

              {/* Aviso Obligatorio de Cuentas Públicas */}
              <View style={styles.helpNoticeWarning}>
                <Ionicons name="lock-closed" size={20} color="#FFD700" />
                <Text style={styles.helpNoticeWarningText}>
                  Cuentas Públicas requeridas: Los Reels y videos deben provenir de perfiles públicos. Instagram y TikTok protegen las cuentas privadas y no permiten descargarlos sin contraseña.
                </Text>
              </View>

              {/* Nota de Google Play */}
              <View style={styles.helpNotice}>
                <Ionicons name="information-circle" size={20} color="#00E5FF" />
                <Text style={styles.helpNoticeText}>
                  Nota: Por políticas oficiales de Google Play Store, no se permiten descargas de YouTube.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowHelpModal(false)}
            >
              <Text style={styles.modalCloseButtonText}>Entendido, ¡a descargar!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal para Renombrar Archivo */}
      <Modal
        visible={renameModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.renameCard}>
            <View style={styles.renameHeader}>
              <Ionicons name="pencil" size={20} color="#FFD700" />
              <Text style={styles.renameTitle}>Renombrar Archivo</Text>
            </View>

            <TextInput
              style={styles.renameInput}
              value={newTitleInput}
              onChangeText={setNewTitleInput}
              placeholder="Ingresa el nuevo nombre..."
              placeholderTextColor="#7D7D9A"
              autoFocus={true}
              selectTextOnFocus={true}
            />

            <View style={styles.renameButtonsRow}>
              <TouchableOpacity
                style={styles.renameCancelBtn}
                onPress={() => setRenameModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.renameCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.renameConfirmBtn}
                onPress={handleSaveRename}
                activeOpacity={0.8}
              >
                <Text style={styles.renameConfirmText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Barra de Navegación Inferior: Elevada con safe insets para panel de botones de Samsung S22 */}
      <View
        style={[
          styles.bottomNav,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.navItem, activeTab === 'download' && styles.navItemActive]}
          onPress={() => setActiveTab('download')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="download"
            size={24}
            color={activeTab === 'download' ? '#00E5FF' : '#7D7D9A'}
          />
          <Text style={[styles.navText, activeTab === 'download' && styles.navTextActive]}>
            Descargar
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'library' && styles.navItemActive]}
          onPress={() => setActiveTab('library')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="folder-open"
            size={24}
            color={activeTab === 'library' ? '#00E5FF' : '#7D7D9A'}
          />
          <Text style={[styles.navText, activeTab === 'library' && styles.navTextActive]}>
            Mis Medios
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#12121A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2C',
    backgroundColor: '#161622',
  },
  headerSpacer: {
    width: 44,
  },
  logoBadgeContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00E5FF',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  logoImage: {
    width: 140,
    height: 46,
  },
  helpHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E1E2C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  tabContent: {
    gap: 16,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E2C',
    padding: 14,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#00E5FF',
    gap: 10,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  infoSub: {
    color: '#A0A0C0',
    fontSize: 12,
    marginTop: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A1A26',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2D2D42',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    height: 52,
    color: '#FFFFFF',
    fontSize: 15,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262638',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  pasteText: {
    color: '#00E5FF',
    fontWeight: '600',
    fontSize: 13,
  },
  sectionTitle: {
    color: '#E0E0FF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  formatRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formatChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A26',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D2D42',
    gap: 8,
  },
  formatChipActive: {
    backgroundColor: '#1E2538',
    borderColor: '#00E5FF',
  },
  formatText: {
    color: '#A0A0C0',
    fontWeight: '600',
    fontSize: 14,
  },
  formatTextActive: {
    color: '#00E5FF',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    height: 54,
    borderRadius: 14,
    marginTop: 6,
    gap: 10,
    shadowColor: '#00E5FF',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 5,
  },
  downloadButtonDisabled: {
    backgroundColor: '#556677',
    shadowOpacity: 0,
  },
  downloadButtonText: {
    color: '#12121A',
    fontSize: 16,
    fontWeight: '700',
  },
  progressCard: {
    backgroundColor: '#1C1C2A',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2E2E44',
    gap: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
    flex: 1,
  },
  progressStatus: {
    color: '#00E5FF',
    fontWeight: '700',
    fontSize: 14,
  },
  progressStatusCompleted: {
    color: '#00E676',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#2A2A3E',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00E5FF',
    borderRadius: 4,
  },
  progressBarCompleted: {
    backgroundColor: '#00E676',
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  progressFormat: {
    color: '#8D8DAA',
    fontSize: 12,
  },
  progressSpeed: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  saveFileBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#00E5FF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveFileBtnText: {
    color: '#12121A',
    fontWeight: '700',
    fontSize: 13,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#1E2538',
    borderWidth: 1,
    borderColor: '#00E5FF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  shareBtnText: {
    color: '#00E5FF',
    fontWeight: '700',
    fontSize: 13,
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E2C',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3B3B54',
    gap: 8,
    marginTop: 8,
  },
  reviewText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  disclaimer: {
    color: '#6E6E88',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
    paddingHorizontal: 12,
  },
  mediaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A26',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A3E',
    gap: 12,
  },
  mediaIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#242436',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaInfo: {
    flex: 1,
  },
  mediaTitle: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  mediaSub: {
    color: '#8D8DAA',
    fontSize: 12,
    marginTop: 2,
  },
  mediaItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  mediaSmallBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#242436',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2F2F45',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#161622',
    borderTopWidth: 1,
    borderTopColor: '#242436',
    paddingTop: 10,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navItemActive: {
    opacity: 1,
  },
  navText: {
    color: '#7D7D9A',
    fontSize: 12,
    fontWeight: '500',
  },
  navTextActive: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  /* Estilos del Modal ¿Cómo se usa? */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#1A1A28',
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#2E2E44',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262638',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  modalBody: {
    marginBottom: 16,
  },
  helpStep: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepBadgeText: {
    color: '#12121A',
    fontWeight: 'bold',
    fontSize: 14,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 2,
  },
  stepDesc: {
    color: '#9E9EB8',
    fontSize: 12,
    lineHeight: 18,
  },
  helpNotice: {
    flexDirection: 'row',
    backgroundColor: '#1E2538',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  helpNoticeText: {
    color: '#D0D0E6',
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  modalCloseButton: {
    backgroundColor: '#00E5FF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#12121A',
    fontWeight: '700',
    fontSize: 15,
  },
  /* Estilos para gestión de biblioteca (Mis Medios) */
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyStateTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyStateSub: {
    color: '#8D8DAA',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
  },
  mediaRenameBtn: {
    borderColor: '#4A3B18',
    backgroundColor: '#242014',
  },
  mediaDeleteBtn: {
    borderColor: '#4A1D24',
    backgroundColor: '#241417',
  },
  /* Aviso de Cuentas Públicas */
  helpNoticeWarning: {
    flexDirection: 'row',
    backgroundColor: '#262214',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#54461B',
  },
  helpNoticeWarningText: {
    color: '#FFE082',
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  /* Estilos del Modal de Renombrar */
  renameCard: {
    backgroundColor: '#1A1A28',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2E2E44',
    width: '90%',
    alignSelf: 'center',
  },
  renameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  renameTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  renameInput: {
    backgroundColor: '#14141E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2D2D42',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  renameButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  renameCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#262638',
  },
  renameCancelText: {
    color: '#A0A0C0',
    fontWeight: '600',
    fontSize: 14,
  },
  renameConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#00E5FF',
  },
  renameConfirmText: {
    color: '#12121A',
    fontWeight: '700',
    fontSize: 14,
  },
});
