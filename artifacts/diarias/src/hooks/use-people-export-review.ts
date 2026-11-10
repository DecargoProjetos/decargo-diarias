import { useQuery } from '@tanstack/react-query';
import { reviewPeopleExportBatch } from '@workspace/api-client-react';

export function usePeopleExportReview(ids: number[], enabled: boolean) {
  const diariaIds = [...new Set(ids)].sort((a, b) => a - b);
  return useQuery({
    queryKey: ['peopleExportReview', diariaIds],
    queryFn: ({ signal }) => reviewPeopleExportBatch({ diariaIds }, { signal }),
    enabled: enabled && diariaIds.length > 0,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
}
