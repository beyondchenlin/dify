import type { Edge, Node } from '@/app/components/workflow/types'
import type { FileUploadConfigResponse } from '@/models/common'
import type { FetchWorkflowDraftResponse } from '@/types/workflow'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useStore as useAppStore } from '@/app/components/app/store'
import {
  useStore,
  useWorkflowStore,
} from '@/app/components/workflow/store'
import { BlockEnum } from '@/app/components/workflow/types'
import { useWorkflowConfig } from '@/service/use-workflow'
import {
  fetchNodesDefaultConfigs,
  fetchPublishedWorkflow,
  fetchWorkflowDraft,
  syncWorkflowDraft,
} from '@/service/workflow'
import { AppModeEnum } from '@/types/app'
import { useWorkflowTemplate } from './use-workflow-template'

const hasConnectedUserInput = (nodes: Node[] = [], edges: Edge[] = []): boolean => {
  const startNodeIds = nodes
    .filter(node => node?.data?.type === BlockEnum.Start)
    .map(node => node.id)

  if (!startNodeIds.length)
    return false

  return edges.some(edge => startNodeIds.includes(edge.source))
}

type ResponseLikeError = {
  bodyUsed?: boolean
  json?: () => Promise<unknown>
  clone?: () => { json: () => Promise<unknown> }
}

const getResponseErrorCode = async (error: unknown): Promise<string | undefined> => {
  if (!error || typeof error !== 'object')
    return undefined

  const response = error as ResponseLikeError
  if (response.bodyUsed || typeof response.json !== 'function')
    return undefined

  try {
    const errorData = typeof response.clone === 'function'
      ? await response.clone().json()
      : await response.json()

    if (errorData && typeof errorData === 'object' && 'code' in errorData) {
      const code = (errorData as { code?: unknown }).code
      return typeof code === 'string' ? code : undefined
    }
  }
  catch {}

  return undefined
}

export const useWorkflowInit = () => {
  const workflowStore = useWorkflowStore()
  const {
    nodes: nodesTemplate,
    edges: edgesTemplate,
  } = useWorkflowTemplate()
  const appDetail = useAppStore(state => state.appDetail)!
  const setSyncWorkflowDraftHash = useStore(s => s.setSyncWorkflowDraftHash)
  const [data, setData] = useState<FetchWorkflowDraftResponse>()
  const [isLoading, setIsLoading] = useState(true)
  const hasInitializedWorkflowRef = useRef(false)
  useEffect(() => {
    workflowStore.setState({ appId: appDetail.id, appName: appDetail.name })
  }, [appDetail.id, appDetail.name, workflowStore])

  const handleUpdateWorkflowFileUploadConfig = useCallback((config: FileUploadConfigResponse) => {
    const { setFileUploadConfig } = workflowStore.getState()
    setFileUploadConfig(config)
  }, [workflowStore])
  const {
    data: fileUploadConfigResponse,
    isLoading: isFileUploadConfigLoading,
  } = useWorkflowConfig('/files/upload', handleUpdateWorkflowFileUploadConfig)

  const applyWorkflowData = useCallback((res: FetchWorkflowDraftResponse) => {
    setData(res)
    workflowStore.setState({
      envSecrets: (res.environment_variables || []).filter(env => env.value_type === 'secret').reduce((acc, env) => {
        acc[env.id] = env.value
        return acc
      }, {} as Record<string, string>),
      environmentVariables: res.environment_variables?.map(env => env.value_type === 'secret' ? { ...env, value: '[__HIDDEN__]' } : env) || [],
      conversationVariables: res.conversation_variables || [],
      isWorkflowDataLoaded: true,
    })
    setSyncWorkflowDraftHash(res.hash)
    setIsLoading(false)
  }, [workflowStore, setSyncWorkflowDraftHash])

  const loadWorkflowData = useCallback(async () => {
    const res = await fetchWorkflowDraft(`/apps/${appDetail.id}/workflows/draft`)
    applyWorkflowData(res)
  }, [appDetail.id, applyWorkflowData])

  const createInitialWorkflowDraft = useCallback(async () => {
    const isAdvancedChat = appDetail.mode === AppModeEnum.ADVANCED_CHAT
    workflowStore.setState({
      notInitialWorkflow: true,
      showOnboarding: !isAdvancedChat,
      shouldAutoOpenStartNodeSelector: !isAdvancedChat,
      hasShownOnboarding: false,
    })
    const nodesData = isAdvancedChat ? nodesTemplate : []
    const edgesData = isAdvancedChat ? edgesTemplate : []

    const res = await syncWorkflowDraft({
      url: `/apps/${appDetail.id}/workflows/draft`,
      params: {
        graph: {
          nodes: nodesData,
          edges: edgesData,
        },
        features: {
          retriever_resource: { enabled: true },
        },
        environment_variables: [],
        conversation_variables: [],
      },
    })
    workflowStore.getState().setDraftUpdatedAt(res.updated_at)
    setSyncWorkflowDraftHash(res.hash)
  }, [appDetail.id, appDetail.mode, nodesTemplate, edgesTemplate, workflowStore, setSyncWorkflowDraftHash])

  const handleGetInitialWorkflowData = useCallback(async () => {
    try {
      await loadWorkflowData()
      return
    }
    catch (error) {
      const errorCode = await getResponseErrorCode(error)
      if (errorCode !== 'draft_workflow_not_exist') {
        console.error(error)
        setIsLoading(false)
        return
      }
    }

    try {
      await createInitialWorkflowDraft()
    }
    catch (error) {
      const errorCode = await getResponseErrorCode(error)
      if (errorCode !== 'draft_workflow_not_sync') {
        console.error(error)
        setIsLoading(false)
        return
      }
    }

    try {
      await loadWorkflowData()
    }
    catch (error) {
      console.error(error)
      setIsLoading(false)
    }
  }, [loadWorkflowData, createInitialWorkflowDraft])

  useEffect(() => {
    if (hasInitializedWorkflowRef.current)
      return
    hasInitializedWorkflowRef.current = true
    handleGetInitialWorkflowData()
  }, [handleGetInitialWorkflowData])

  const handleFetchPreloadData = useCallback(async () => {
    try {
      const nodesDefaultConfigsData = await fetchNodesDefaultConfigs(`/apps/${appDetail?.id}/workflows/default-workflow-block-configs`)
      const publishedWorkflow = await fetchPublishedWorkflow(`/apps/${appDetail?.id}/workflows/publish`)
      workflowStore.setState({
        nodesDefaultConfigs: nodesDefaultConfigsData.reduce((acc, block) => {
          if (!acc[block.type])
            acc[block.type] = { ...block.config }
          return acc
        }, {} as Record<string, any>),
      })
      workflowStore.getState().setPublishedAt(publishedWorkflow?.created_at ?? 0)
      const graph = publishedWorkflow?.graph
      workflowStore.getState().setLastPublishedHasUserInput(
        hasConnectedUserInput(graph?.nodes, graph?.edges),
      )
    }
    catch (e) {
      console.error(e)
      workflowStore.getState().setLastPublishedHasUserInput(false)
    }
  }, [workflowStore, appDetail])

  useEffect(() => {
    handleFetchPreloadData()
  }, [handleFetchPreloadData])

  useEffect(() => {
    if (data) {
      workflowStore.getState().setDraftUpdatedAt(data.updated_at)
      workflowStore.getState().setToolPublished(data.tool_published)
    }
  }, [data, workflowStore])

  return {
    data,
    isLoading: isLoading || isFileUploadConfigLoading,
    fileUploadConfigResponse,
  }
}
