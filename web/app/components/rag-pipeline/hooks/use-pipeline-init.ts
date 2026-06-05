import type { FetchWorkflowDraftResponse } from '@/types/workflow'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  useWorkflowStore,
} from '@/app/components/workflow/store'
import { useDatasetDetailContextWithSelector } from '@/context/dataset-detail'
import {
  fetchWorkflowDraft,
  syncWorkflowDraft,
} from '@/service/workflow'
import { usePipelineConfig } from './use-pipeline-config'
import { usePipelineTemplate } from './use-pipeline-template'

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

export const usePipelineInit = () => {
  const workflowStore = useWorkflowStore()
  const {
    nodes: nodesTemplate,
    edges: edgesTemplate,
  } = usePipelineTemplate()
  const [data, setData] = useState<FetchWorkflowDraftResponse>()
  const [isLoading, setIsLoading] = useState(true)
  const hasInitializedWorkflowRef = useRef(false)
  const datasetId = useDatasetDetailContextWithSelector(s => s.dataset)?.pipeline_id
  const knowledgeName = useDatasetDetailContextWithSelector(s => s.dataset)?.name
  const knowledgeIcon = useDatasetDetailContextWithSelector(s => s.dataset)?.icon_info

  useEffect(() => {
    workflowStore.setState({ pipelineId: datasetId, knowledgeName, knowledgeIcon })
  }, [datasetId, workflowStore, knowledgeName, knowledgeIcon])

  usePipelineConfig()

  const applyWorkflowData = useCallback((res: FetchWorkflowDraftResponse) => {
    const {
      setEnvSecrets,
      setEnvironmentVariables,
      setSyncWorkflowDraftHash,
      setDraftUpdatedAt,
      setToolPublished,
      setRagPipelineVariables,
    } = workflowStore.getState()
    setData(res)
    setDraftUpdatedAt(res.updated_at)
    setToolPublished(res.tool_published)
    setEnvSecrets((res.environment_variables || []).filter(env => env.value_type === 'secret').reduce((acc, env) => {
      acc[env.id] = env.value
      return acc
    }, {} as Record<string, string>))
    setEnvironmentVariables(res.environment_variables?.map(env => env.value_type === 'secret' ? { ...env, value: '[__HIDDEN__]' } : env) || [])
    setSyncWorkflowDraftHash(res.hash)
    setRagPipelineVariables?.(res.rag_pipeline_variables || [])
    setIsLoading(false)
  }, [workflowStore])

  const loadWorkflowData = useCallback(async () => {
    const res = await fetchWorkflowDraft(`/rag/pipelines/${datasetId}/workflows/draft`)
    applyWorkflowData(res)
  }, [datasetId, applyWorkflowData])

  const createInitialWorkflowDraft = useCallback(async () => {
    workflowStore.setState({
      notInitialWorkflow: true,
      shouldAutoOpenStartNodeSelector: true,
    })
    const res = await syncWorkflowDraft({
      url: `/rag/pipelines/${datasetId}/workflows/draft`,
      params: {
        graph: {
          nodes: nodesTemplate,
          edges: edgesTemplate,
        },
        environment_variables: [],
      },
    })
    workflowStore.getState().setDraftUpdatedAt(res.updated_at)
  }, [nodesTemplate, edgesTemplate, workflowStore, datasetId])

  const handleGetInitialWorkflowData = useCallback(async () => {
    try {
      await loadWorkflowData()
      return
    }
    catch (error) {
      const errorCode = await getResponseErrorCode(error)
      if (errorCode !== 'draft_workflow_not_exist' || !datasetId) {
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
  }, [loadWorkflowData, datasetId, createInitialWorkflowDraft])

  useEffect(() => {
    if (hasInitializedWorkflowRef.current)
      return
    hasInitializedWorkflowRef.current = true
    handleGetInitialWorkflowData()
  }, [handleGetInitialWorkflowData])

  return {
    data,
    isLoading,
  }
}
