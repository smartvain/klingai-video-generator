'use client'

import { useEffect, useState } from 'react'

import { klingaiClient } from '@/api/klingai'
import { PromptTextarea } from '@/components/ui'
import { ImageUploader } from '@/components/ui'
import { MODEL_LIST, MODE_LIST, DURATION_LIST } from '@/constants/generateVideoSettings'
import { useSelectValue } from '@/hooks'
import { useImageProcessor } from '@/hooks'

const initialPrompt =
  'Create a natural, fluid animation with subtle human-like movements:' +
  '- Maintain gentle, organic motion' +
  '- Add slight breathing movement' +
  '- Include minimal head tilt and micro-expressions' +
  '- Ensure smooth transitions between frames' +
  '- Keep movements delicate and realistic' +
  '- Preserve the original image quality' +
  '- Apply natural motion physics'

const initialNegativePrompt =
  'lowres, (worst quality, bad quality:1.2), bad anatomy, sketch, ' +
  'jpeg artifacts, signature, watermark, old, oldest, censored, bar_censor, ' +
  '(pregnant), chibi, loli, simple background'

const LOCAL_STORAGE_KEY = 'klingai_video_urls'

export function VideoConverter() {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [videoUrl, setVideoUrl] = useState<string>('')

  // ui
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true)

  // 生成済み動画一覧
  const [videoList, setVideoList] = useState<string[]>([])

  // ユーザー入力項目
  const [prompt, setPrompt] = useState<string>('')
  const [negative_prompt, setNegativePrompt] = useState<string>('')
  const model = useSelectValue(MODEL_LIST.KLING_V1_6.value, MODEL_LIST)
  const mode = useSelectValue(MODE_LIST.STANDARD.value, MODE_LIST)
  const duration = useSelectValue(DURATION_LIST.SHORT.value, DURATION_LIST)
  const { processImage, imageUrl, imagePreviewUrl, setImageUrl, setImagePreviewUrl } =
    useImageProcessor()

  // ファイル選択時の処理
  const handleSelectImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const { isValid, error } = await processImage(file)
    if (!isValid && error) {
      alert(error)
    }
  }

  // 画像を削除時の処理
  const handleRemovePreviewImage = () => {
    setImageUrl(null)
    setImagePreviewUrl(null)
    const input = document.getElementById('image') as HTMLInputElement
    if (input) input.value = ''
  }

  // 生成済みの動画一覧を取得
  const handleQueryTaskList = async (isCache: boolean = false) => {
    try {
      setIsLoading(true)

      const cachedUrlsText = isCache ? localStorage.getItem(LOCAL_STORAGE_KEY) : null
      if (cachedUrlsText) {
        setVideoList(JSON.parse(cachedUrlsText))
        return
      }

      const result = await klingaiClient.queryTaskListImageToVideo()
      console.log('result: ', result)
      const videoUrls = result.data
        .map((task) => task.task_result?.videos?.[0].url || '')
        .filter((url) => url !== '')

      if (videoUrls && videoUrls.length > 0) {
        setVideoList(videoUrls)
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(videoUrls))
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 画像から動画を生成
  const handleGenerateVideoFromImage = async () => {
    try {
      setIsLoading(true)
      setError('')
      setVideoUrl('')

      const params = {
        image: imageUrl || '',
        model_name: model.value,
        mode: mode.value,
        duration: duration.value,
        prompt: `${prompt}, ${initialPrompt}`,
        negative_prompt: `${negative_prompt}, ${initialNegativePrompt}`,
        cfg_scale: 0.5,
      }

      const result = await klingaiClient.createTaskImageToVideo(params)

      pollStatus(result.data.task_id)
    } catch (error) {
      console.error('Error:', error)
      setError('エラーが発生しました')
      setIsLoading(false)
    } finally {
      setIsLoading(false)
      console.log('動画生成が完了しました')
    }
  }

  // ポーリング処理
  const pollStatus = async (taskId: string) => {
    try {
      const response = await klingaiClient.queryTaskImageToVideo({
        task_id: taskId,
      })

      console.log('queryTaskImageToVideoResponse: ', response)

      const isComplete = response.data.task_status === 'succeed'
      const isFailed = response.data.task_status === 'failed' // エラー状態の確認を追加

      if (isFailed) {
        setError('動画の生成に失敗しました')
        setIsLoading(false)
        return
      }

      if (!isComplete) {
        // ５秒後に再度確認
        setTimeout(() => pollStatus(taskId), 5000)
      } else {
        const videoUrl = response.data.task_result?.videos?.[0].url || ''
        setVideoUrl(videoUrl)
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Polling error:', error)
      setError('ポーリング中にエラーが発生しました')
      setIsLoading(false)
    }
  }

  useEffect(() => {
    handleQueryTaskList(true)
  }, [])

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[450px] flex-shrink-0 p-4 border-r flex flex-col">
        <div className="flex-grow overflow-y-auto scrollbar-none">
          {/* ポジティブプロンプト */}
          <PromptTextarea
            label="Prompt"
            value={prompt}
            onChange={setPrompt}
            placeholder="Enter your prompt here..."
          />
          {/* ネガティブプロンプト */}
          <PromptTextarea
            className="mt-4"
            label="Negative Prompt"
            value={negative_prompt}
            onChange={setNegativePrompt}
            placeholder="Enter your negative prompt here..."
          />
          {/* 画像アップロード */}
          <ImageUploader
            className="mt-4"
            onSelectImage={handleSelectImage}
            onRemoveImage={handleRemovePreviewImage}
            imagePreviewUrl={imagePreviewUrl}
          />

          <div className="mt-4">
            <details className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <summary className="font-medium cursor-pointer">Settings</summary>

              <div className="mt-4">
                <label htmlFor="model" className="block mb-2">
                  Model
                </label>
                <select
                  id="model"
                  value={model.value}
                  onChange={model.onChange}
                  className="w-full p-2 border rounded"
                >
                  {Object.entries(MODEL_LIST).map(([key, value]) => (
                    <option key={key} value={value.value}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <label htmlFor="mode" className="block mb-2">
                  Mode
                </label>
                <select
                  id="mode"
                  value={mode.value}
                  onChange={mode.onChange}
                  className="w-full p-2 border rounded"
                >
                  {Object.entries(MODE_LIST).map(([key, value]) => (
                    <option key={key} value={value.value}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <label htmlFor="duration" className="block mb-2">
                  Duration
                </label>
                <select
                  id="duration"
                  value={duration.value}
                  onChange={duration.onChange}
                  className="w-full p-2 border rounded"
                >
                  {Object.entries(DURATION_LIST).map(([key, value]) => (
                    <option key={key} value={value.value}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </div>
            </details>
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={handleGenerateVideoFromImage}
            disabled={!imageUrl || isLoading}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate
          </button>
        </div>
      </div>

      <div className="flex-grow p-4 overflow-y-auto">
        {error && <div className="text-red-500 mt-4">{error}</div>}

        <div
          className={`bg-gray-50 dark:bg-gray-800 rounded-lg shadow-sm h-[600px] ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <div className="relative rounded-lg overflow-hidden bg-black h-full">
            {videoUrl && (
              <>
                <button
                  onClick={() => setVideoUrl('')}
                  className="absolute top-2 right-2 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
                <video
                  key={videoUrl}
                  controls
                  autoPlay
                  loop
                  className="w-full max-w-2xl mx-auto h-full"
                >
                  <source src={videoUrl} type="video/mp4" />
                  Your browser does not support video playback.
                </video>
              </>
            )}
            {isLoading && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <svg
                  className="animate-spin h-10 w-10 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="h-8 w-4 bg-gray-100 hover:bg-gray-200 flex items-center justify-center self-center rounded-l"
        >
          <span className="transform rotate-90 text-gray-500 text-sm">
            {isSidebarOpen ? '▼' : '▲'}
          </span>
        </button>

        <div
          className={`
            transition-all duration-300 ease-in-out
            ${isSidebarOpen ? 'w-[200px]' : 'w-0'}
            flex-shrink-0 border-l overflow-hidden h-full
          `}
        >
          <div className="p-4 w-[200px] h-full overflow-y-auto">
            <button
              onClick={() => handleQueryTaskList(false)}
              disabled={isLoading}
              className={`w-full mb-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 flex items-center justify-center gap-2 ${isLoading ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`${isLoading ? 'animate-spin' : ''}`}
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            </button>
            {videoList.map((videoUrl, index) => (
              <div key={index} className="mb-4">
                <video
                  className={`w-full h-auto rounded-lg ${isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  preload="metadata"
                  muted
                  playsInline
                  onClick={() => !isLoading && setVideoUrl(videoUrl)}
                  onMouseOver={(e) => !isLoading && e.currentTarget.play()}
                  onMouseOut={(e) => {
                    if (!isLoading) {
                      e.currentTarget.pause()
                      e.currentTarget.currentTime = 0
                    }
                  }}
                >
                  <source src={videoUrl} type="video/mp4" />
                </video>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
