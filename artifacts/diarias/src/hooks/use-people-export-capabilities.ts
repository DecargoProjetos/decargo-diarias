import {
  getGetPeopleExportCapabilitiesQueryKey,
  useGetPeopleExportCapabilities,
} from '@workspace/api-client-react';

export function usePeopleExportCapabilities(enabled: boolean) {
  return useGetPeopleExportCapabilities({
    query: {
      queryKey: getGetPeopleExportCapabilitiesQueryKey(),
      enabled,
      retry: false,
      staleTime: 0,
      refetchOnMount: 'always',
    },
  });
}
