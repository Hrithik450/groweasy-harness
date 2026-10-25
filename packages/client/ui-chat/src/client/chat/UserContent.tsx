/** Reusable user contents inside a caller-owned message row. */
import { Fragment, useCallback, useState } from 'react'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import type { VideoAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { fileExtension, FileTypeIcon, fileSizeText, JsonBlock, VideoLightbox } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './MessageItem.module.css'

const EMPTY_LABELS: readonly string[] = []

function VideoCard({
  file,
  index,
  loadImage,
  t,
}: {
  file: VideoAttachmentRef
  index: number
  loadImage: FactoryComponentPropsOf<'conversation.chat.user.content'>['loadImage']
  t: FactoryComponentPropsOf<'conversation.chat.user.content'>['t']
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const fileName = file.name ?? 'video'
  const duration = typeof file.duration === 'number'
    ? `${file.duration.toFixed(1)}s`
    : undefined

  const handleClick = useCallback(() => {
    if (url !== null) {
      setOpen(true)
      return
    }
    void loadImage(file as never)
      .then((loadedUrl) => {
        setUrl(loadedUrl)
        setOpen(true)
      })
      .catch(() => {})
  }, [file, loadImage, url])

  const close = useCallback(() => { setOpen(false) }, [])

  return (
    <>
      <button
        key={`file:${index}`}
        type="button"
        className={`${css.fileCard} ${css.videoCard}`}
        title={t('video.open')}
        aria-label={`${fileName} (${t('video.open')})`}
        onClick={handleClick}
      >
        <FileTypeIcon path={fileName} className={css.fileIcon} />
        <span className={css.fileContent}>
          <span className={css.fileName}>{fileName}</span>
          <span className={css.fileMeta}>
            {[fileExtension(fileName).toUpperCase().slice(0, 8), duration, fileSizeText(file.bytes)]
              .filter(Boolean).join(' ')}
          </span>
        </span>
      </button>
      {open && url !== null && (
        <VideoLightbox
          src={url}
          alt={fileName}
          labels={{ dialog: t('video.dialog'), close: t('video.close') }}
          onClose={close}
        />
      )}
    </>
  )
}

/**
 * Render prepared text, ordered attachments, and references without message chrome.
 * The caller owns row identity, pending/echo state, time, and message actions.
 * @param props - prepared content, facts, authorized image loader, and framework Factory/locale seats.
 * @returns the content stack using the existing user-message layout.
 */
export function UserContent({ content, loadImage, facts, interactive = false, ellipsis = false, renderSlot, renderFactorySlot, t }:
FactoryComponentPropsOf<'conversation.chat.user.content'>) {
  const { text, attachments, extraBlocks, referenceLabels = EMPTY_LABELS } = content
  const compactImages = attachments.length > 1
  const truncated = (total: number): string => t('json.truncated', { total })
  const showBubble = text !== '' || extraBlocks.length > 0
  return (
    <div className={css.userStack}>
      {attachments.length > 0 && (
        <div className={css.attachmentRow} data-message-attachments>
          {attachments.map((attachment, index) => attachment.type === 'image'
            ? (
              <Fragment key={`image:${index}`}>
                {renderSlot('conversation.chat.user.images', {
                  images: [attachment.image], loadImage, align: 'end', compact: compactImages,
                })}
              </Fragment>
            )
            : (() => {
              const isVideo = 'duration' in attachment.file || ('mediaType' in attachment.file && typeof attachment.file.mediaType === 'string' && attachment.file.mediaType.startsWith('video/'))
              if (isVideo) {
                return <VideoCard key={`file:${index}`} file={attachment.file as VideoAttachmentRef} index={index} loadImage={loadImage} t={t} />
              }
              const fileName = attachment.file.name ?? 'file'
              return (
                <span key={`file:${index}`} className={css.fileCard} title={fileName}>
                  <FileTypeIcon path={fileName} className={css.fileIcon} />
                  <span className={css.fileContent}>
                    <span className={css.fileName}>{fileName}</span>
                    <span className={css.fileMeta}>
                      {[fileExtension(fileName).toUpperCase().slice(0, 8), fileSizeText(attachment.file.bytes)]
                        .filter(Boolean).join(' ')}
                    </span>
                  </span>
                </span>
              )
            })())}
        </div>
      )}
      {showBubble && <div className={css.bubble}>
        {renderFactorySlot('conversation.user.text', { text, facts, interactive, ellipsis })}
        {extraBlocks.map((block, index) => (
          <JsonBlock key={index} label={t('message.extraBlock')} payload={block} truncatedLabel={truncated} />
        ))}
      </div>}
      {referenceLabels.length > 0 && (
        <div className={css.referenceSummary}>
          {t('message.referenceSummary', { labels: referenceLabels.join(t('message.referenceSeparator')) })}
        </div>
      )}
    </div>
  )
}
