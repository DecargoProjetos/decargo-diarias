ErrorType<unknown>;
/**
* @summary Update user role, team, name, email or status (admin only)
*/
export declare const useUpdateUser: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateUser>>, TError, {
        id: number;
        data: BodyType<UserUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateUser>>, TError, {
    id: number;
    data: BodyType<UserUpdate>;
}, TContext>;
export declare const getDeleteUserUrl: (id: number) => string;
/**
 * @summary Delete a user (admin only)
 */
export declare const deleteUser: (id: number, options?: RequestInit) => Promise<MessageResponse>;
export declare const getDeleteUserMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
    id: number;
}, TContext>;
export type DeleteUserMutationResult = NonNullable<Awaited<ReturnType<typeof deleteUser>>>;
export type DeleteUserMutationError = ErrorType<ErrorResponse>;
/**
* @summary Delete a user (admin only)
*/
export declare const useDeleteUser: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteUser>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteUser>>, TError, {
    id: number;
}, TContext>;
export declare const getListTeamsUrl: () => string;
/**
 * @summary List teams
 */
export declare const listTeams: (options?: RequestInit) => Promise<Team[]>;
export declare const getListTeamsQueryKey: () => readonly ["/api/teams"];
export declare const getListTeamsQueryOptions: <TData = Awaited<ReturnType<typeof listTeams>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTeams>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listTeams>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListTeamsQueryResult = NonNullable<Awaited<ReturnType<typeof listTeams>>>;
export type ListTeamsQueryError = ErrorType<unknown>;
/**
 * @summary List teams
 */
export declare function useListTeams<TData = Awaited<ReturnType<typeof listTeams>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTeams>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateTeamUrl: () => string;
/**
 * @summary Create a team (admin only)
 */
export declare const createTeam: (teamInput: TeamInput, options?: RequestInit) => Promise<Team>;
export declare const getCreateTeamMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTeam>>, TError, {
        data: BodyType<TeamInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createTeam>>, TError, {
    data: BodyType<TeamInput>;
}, TContext>;
export type CreateTeamMutationResult = NonNullable<Awaited<ReturnType<typeof createTeam>>>;
export type CreateTeamMutationBody = BodyType<TeamInput>;
export type CreateTeamMutationError = ErrorType<unknown>;
/**
* @summary Create a team (admin only)
*/
export declare const useCreateTeam: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTeam>>, TError, {
        data: BodyType<TeamInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createTeam>>, TError, {
    data: BodyType<TeamInput>;
}, TContext>;
export declare const getGetTeamUrl: (id: number) => string;
/**
 * @summary Get a team by ID
 */
export declare const getTeam: (id: number, options?: RequestInit) => Promise<Team>;
export declare const getGetTeamQueryKey: (id: number) => readonly [`/api/teams/${number}`];
export declare const getGetTeamQueryOptions: <TData = Awaited<ReturnType<typeof getTeam>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTeam>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTeam>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTeamQueryResult = NonNullable<Awaited<ReturnType<typeof getTeam>>>;
export type GetTeamQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get a team by ID
 */
export declare function useGetTeam<TData = Awaited<ReturnType<typeof getTeam>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTeam>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateTeamUrl: (id: number) => string;
/**
 * @summary Update a team (admin only)
 */
export declare const updateTeam: (id: number, teamUpdate: TeamUpdate, options?: RequestInit) => Promise<Team>;
export declare const getUpdateTeamMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTeam>>, TError, {
        id: number;
        data: BodyType<TeamUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateTeam>>, TError, {
    id: number;
    data: BodyType<TeamUpdate>;
}, TContext>;
export type UpdateTeamMutationResult = NonNullable<Awaited<ReturnType<typeof updateTeam>>>;
export type UpdateTeamMutationBody = BodyType<TeamUpdate>;
export type UpdateTeamMutationError = ErrorType<unknown>;
/**
* @summary Update a team (admin only)
*/
export declare const useUpdateTeam: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTeam>>, TError, {
        id: number;
        data: BodyType<TeamUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateTeam>>, TError, {
    id: number;
    data: BodyType<TeamUpdate>;
}, TContext>;
export declare const getDeleteTeamUrl: (id: number) => string;
/**
 * @summary Delete a team (admin only)
 */
export declare const deleteTeam: (id: number, options?: RequestInit) => Promise<MessageResponse>;
export declare const getDeleteTeamMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTeam>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteTeam>>, TError, {
    id: number;
}, TContext>;
export type DeleteTeamMutationResult = NonNullable<Awaited<ReturnType<typeof deleteTeam>>>;
export type DeleteTeamMutationError = ErrorType<unknown>;
/**
* @summary Delete a team (admin only)
*/
export declare const useDeleteTeam: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTeam>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteTeam>>, TError, {
    id: number;
}, TContext>;
export declare const getListProvidersUrl: (params?: ListProvidersParams) => string;
/**
 * @summary List service providers
 */
export declare const listProviders: (params?: ListProvidersParams, options?: RequestInit) => Promise<Provider[]>;
export declare const getListProvidersQueryKey: (params?: ListProvidersParams) => readonly ["/api/providers", ...ListProvidersParams[]];
export declare const getListProvidersQueryOptions: <TData = Awaited<ReturnType<typeof listProviders>>, TError = ErrorType<unknown>>(params?: ListProvidersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProviders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listProviders>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListProvidersQueryResult = NonNullable<Awaited<ReturnType<typeof listProviders>>>;
export type ListProvidersQueryError = ErrorType<unknown>;
/**
 * @summary List service providers
 */
export declare function useListProviders<TData = Awaited<ReturnType<typeof listProviders>>, TError = ErrorType<unknown>>(params?: ListProvidersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProviders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSyncProvidersUrl: () => string;
/**
 * @summary Sync providers from DECARGO People (admin only)
 */
export declare const syncProviders: (options?: RequestInit) => Promise<SyncResult>;
export declare const getSyncProvidersMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof syncProviders>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof syncProviders>>, TError, void, TContext>;
export type SyncProvidersMutationResult = NonNullable<Awaited<ReturnType<typeof syncProviders>>>;
export type SyncProvidersMutationError = ErrorType<unknown>;
/**
* @summary Sync providers from DECARGO People (admin only)
*/
export declare const useSyncProviders: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof syncProviders>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof syncProviders>>, TError, void, TContext>;
export declare const getGetProviderUrl: (id: number) => string;
/**
 * @summary Get a provider by ID
 */
export declare const getProvider: (id: number, options?: RequestInit) => Promise<Provider>;
export declare const getGetProviderQueryKey: (id: number) => readonly [`/api/providers/${number}`];
export declare const getGetProviderQueryOptions: <TData = Awaited<ReturnType<typeof getProvider>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProvider>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getProvider>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetProviderQueryResult = NonNullable<Awaited<ReturnType<typeof getProvider>>>;
export type GetProviderQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get a provider by ID
 */
export declare function useGetProvider<TData = Awaited<ReturnType<typeof getProvider>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProvider>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateProviderUrl: (id: number) => string;
/**
 * @summary Update a provider's name, email, team or status (admin only)
 */
export declare const updateProvider: (id: number, providerUpdate: ProviderUpdate, options?: RequestInit) => Promise<Provider>;
export declare const getUpdateProviderMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProvider>>, TError, {
        id: number;
        data: BodyType<ProviderUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateProvider>>, TError, {
    id: number;
    data: BodyType<ProviderUpdate>;
}, TContext>;
export type UpdateProviderMutationResult = NonNullable<Awaited<ReturnType<typeof updateProvider>>>;
export type UpdateProviderMutationBody = BodyType<ProviderUpdate>;
export type UpdateProviderMutationError = ErrorType<unknown>;
/**
* @summary Update a provider's name, email, team or status (admin only)
*/
export declare const useUpdateProvider: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProvider>>, TError, {
        id: number;
        data: BodyType<ProviderUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateProvider>>, TError, {
    id: number;
    data: BodyType<ProviderUpdate>;
}, TContext>;
export declare const getDeleteProviderUrl: (id: number) => string;
/**
 * @summary Delete a provider (admin only)
 */
export declare const deleteProvider: (id: number, options?: RequestInit) => Promise<MessageResponse>;
export declare const getDeleteProviderMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProvider>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteProvider>>, TError, {
    id: number;
}, TContext>;
export type DeleteProviderMutationResult = NonNullable<Awaited<ReturnType<typeof deleteProvider>>>;
export type DeleteProviderMutationError = ErrorType<ErrorResponse>;
/**
* @summary Delete a provider (admin only)
*/
export declare const useDeleteProvider: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProvider>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteProvider>>, TError, {
    id: number;
}, TContext>;
export declare const getListDiariasUrl: (params?: ListDiariasParams) => string;
/**
 * @summary List daily rate records (filtered by role)
 */
export declare const listDiarias: (params?: ListDiariasParams, options?: RequestInit) => Promise<DiariasPage>;
export declare const getListDiariasQueryKey: (params?: ListDiariasParams) => readonly ["/api/diarias", ...ListDiariasParams[]];
export declare const getListDiariasQueryOptions: <TData = Awaited<ReturnType<typeof listDiarias>>, TError = ErrorType<unknown>>(params?: ListDiariasParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listDiarias>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listDiarias>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListDiariasQueryResult = NonNullable<Awaited<ReturnType<typeof listDiarias>>>;
export type ListDiariasQueryError = ErrorType<unknown>;
/**
 * @summary List daily rate records (filtered by role)
 */
export declare function useListDiarias<TData = Awaited<ReturnType<typeof listDiarias>>, TError = ErrorType<unknown>>(params?: ListDiariasParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listDiarias>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateDiariaUrl: () => string;
/**
 * @summary Register a new daily rate (manager only)
 */
export declare const createDiaria: (diariaInput: DiariaInput, options?: RequestInit) => Promise<Diaria>;
export declare const getCreateDiariaMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createDiaria>>, TError, {
        data: BodyType<DiariaInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createDiaria>>, TError, {
    data: BodyType<DiariaInput>;
}, TContext>;
export type CreateDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof createDiaria>>>;
export type CreateDiariaMutationBody = BodyType<DiariaInput>;
export type CreateDiariaMutationError = ErrorType<unknown>;
/**
* @summary Register a new daily rate (manager only)
*/
export declare const useCreateDiaria: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createDiaria>>, TError, {
        data: BodyType<DiariaInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createDiaria>>, TError, {
    data: BodyType<DiariaInput>;
}, TContext>;
export declare const getGetDiariasAnaliseSummaryUrl: (params?: GetDiariasAnaliseSummaryParams) => string;
/**
 * @summary Dashboard indicators for the Análise de Diárias screen (admin only)
 */
export declare const getDiariasAnaliseSummary: (params?: GetDiariasAnaliseSummaryParams, options?: RequestInit) => Promise<DiariasAnaliseSummary>;
export declare const getGetDiariasAnaliseSummaryQueryKey: (params?: GetDiariasAnaliseSummaryParams) => readonly ["/api/diarias/summary", ...GetDiariasAnaliseSummaryParams[]];
export declare const getGetDiariasAnaliseSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getDiariasAnaliseSummary>>, TError = ErrorType<unknown>>(params?: GetDiariasAnaliseSummaryParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDiariasAnaliseSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDiariasAnaliseSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDiariasAnaliseSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getDiariasAnaliseSummary>>>;
export type GetDiariasAnaliseSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Dashboard indicators for the Análise de Diárias screen (admin only)
 */
export declare function useGetDiariasAnaliseSummary<TData = Awaited<ReturnType<typeof getDiariasAnaliseSummary>>, TError = ErrorType<unknown>>(params?: GetDiariasAnaliseSummaryParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDiariasAnaliseSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListDiariaIdsUrl: (params?: ListDiariaIdsParams) => string;
/**
 * @summary List all daily rate IDs matching the current filters, unpaginated (admin only, used for "select all filtered")
 */
export declare const listDiariaIds: (params?: ListDiariaIdsParams, options?: RequestInit) => Promise<DiariaIdsResult>;
export declare const getListDiariaIdsQueryKey: (params?: ListDiariaIdsParams) => readonly ["/api/diarias/ids", ...ListDiariaIdsParams[]];
export declare const getListDiariaIdsQueryOptions: <TData = Awaited<ReturnType<typeof listDiariaIds>>, TError = ErrorType<unknown>>(params?: ListDiariaIdsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listDiariaIds>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listDiariaIds>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListDiariaIdsQueryResult = NonNullable<Awaited<ReturnType<typeof listDiariaIds>>>;
export type ListDiariaIdsQueryError = ErrorType<unknown>;
/**
 * @summary List all daily rate IDs matching the current filters, unpaginated (admin only, used for "select all filtered")
 */
export declare function useListDiariaIds<TData = Awaited<ReturnType<typeof listDiariaIds>>, TError = ErrorType<unknown>>(params?: ListDiariaIdsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listDiariaIds>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getBulkApproveDiariasUrl: () => string;
/**
 * @summary Approve multiple daily rates at once (admin only)
 */
export declare const bulkApproveDiarias: (bulkIdsInput: BulkIdsInput, options?: RequestInit) => Promise<BulkActionResult>;
export declare const getBulkApproveDiariasMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkApproveDiarias>>, TError, {
        data: BodyType<BulkIdsInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof bulkApproveDiarias>>, TError, {
    data: BodyType<BulkIdsInput>;
}, TContext>;
export type BulkApproveDiariasMutationResult = NonNullable<Awaited<ReturnType<typeof bulkApproveDiarias>>>;
export type BulkApproveDiariasMutationBody = BodyType<BulkIdsInput>;
export type BulkApproveDiariasMutationError = ErrorType<unknown>;
/**
* @summary Approve multiple daily rates at once (admin only)
*/
export declare const useBulkApproveDiarias: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkApproveDiarias>>, TError, {
        data: BodyType<BulkIdsInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof bulkApproveDiarias>>, TError, {
    data: BodyType<BulkIdsInput>;
}, TContext>;
export declare const getBulkRejectDiariasUrl: () => string;
/**
 * @summary Reject multiple daily rates at once (admin only). A rejection reason is required.
 */
export declare const bulkRejectDiarias: (bulkRejectInput: BulkRejectInput, options?: RequestInit) => Promise<BulkActionResult>;
export declare const getBulkRejectDiariasMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkRejectDiarias>>, TError, {
        data: BodyType<BulkRejectInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof bulkRejectDiarias>>, TError, {
    data: BodyType<BulkRejectInput>;
}, TContext>;
export type BulkRejectDiariasMutationResult = NonNullable<Awaited<ReturnType<typeof bulkRejectDiarias>>>;
export type BulkRejectDiariasMutationBody = BodyType<BulkRejectInput>;
export type BulkRejectDiariasMutationError = ErrorType<unknown>;
/**
* @summary Reject multiple daily rates at once (admin only). A rejection reason is required.
*/
export declare const useBulkRejectDiarias: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkRejectDiarias>>, TError, {
        data: BodyType<BulkRejectInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof bulkRejectDiarias>>, TError, {
    data: BodyType<BulkRejectInput>;
}, TContext>;
export declare const getBulkSetDiariaPaymentDateUrl: () => string;
/**
 * @summary Apply a payment date to multiple daily rates at once (admin only)
 */
export declare const bulkSetDiariaPaymentDate: (bulkSetPaymentDateInput: BulkSetPaymentDateInput, options?: RequestInit) => Promise<BulkActionResult>;
export declare const getBulkSetDiariaPaymentDateMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkSetDiariaPaymentDate>>, TError, {
        data: BodyType<BulkSetPaymentDateInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof bulkSetDiariaPaymentDate>>, TError, {
    data: BodyType<BulkSetPaymentDateInput>;
}, TContext>;
export type BulkSetDiariaPaymentDateMutationResult = NonNullable<Awaited<ReturnType<typeof bulkSetDiariaPaymentDate>>>;
export type BulkSetDiariaPaymentDateMutationBody = BodyType<BulkSetPaymentDateInput>;
export type BulkSetDiariaPaymentDateMutationError = ErrorType<unknown>;
/**
* @summary Apply a payment date to multiple daily rates at once (admin only)
*/
export declare const useBulkSetDiariaPaymentDate: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkSetDiariaPaymentDate>>, TError, {
        data: BodyType<BulkSetPaymentDateInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof bulkSetDiariaPaymentDate>>, TError, {
    data: BodyType<BulkSetPaymentDateInput>;
}, TContext>;
export declare const getSetDiariaPaymentDateUrl: (id: number) => string;
/**
 * @summary Set/update the payment date of a daily rate (admin only, blocked after export)
 */
export declare const setDiariaPaymentDate: (id: number, paymentDateInput: PaymentDateInput, options?: RequestInit) => Promise<Diaria>;
export declare const getSetDiariaPaymentDateMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof setDiariaPaymentDate>>, TError, {
        id: number;
        data: BodyType<PaymentDateInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof setDiariaPaymentDate>>, TError, {
    id: number;
    data: BodyType<PaymentDateInput>;
}, TContext>;
export type SetDiariaPaymentDateMutationResult = NonNullable<Awaited<ReturnType<typeof setDiariaPaymentDate>>>;
export type SetDiariaPaymentDateMutationBody = BodyType<PaymentDateInput>;
export type SetDiariaPaymentDateMutationError = ErrorType<ErrorResponse>;
/**
* @summary Set/update the payment date of a daily rate (admin only, blocked after export)
*/
export declare const useSetDiariaPaymentDate: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof setDiariaPaymentDate>>, TError, {
        id: number;
        data: BodyType<PaymentDateInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof setDiariaPaymentDate>>, TError, {
    id: number;
    data: BodyType<PaymentDateInput>;
}, TContext>;
export declare const getGetDiariaUrl: (id: number) => string;
/**
 * @summary Get a daily rate by ID
 */
export declare const getDiaria: (id: number, options?: RequestInit) => Promise<Diaria>;
export declare const getGetDiariaQueryKey: (id: number) => readonly [`/api/diarias/${number}`];
export declare const getGetDiariaQueryOptions: <TData = Awaited<ReturnType<typeof getDiaria>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDiaria>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDiaria>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDiariaQueryResult = NonNullable<Awaited<ReturnType<typeof getDiaria>>>;
export type GetDiariaQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get a daily rate by ID
 */
export declare function useGetDiaria<TData = Awaited<ReturnType<typeof getDiaria>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDiaria>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateDiariaUrl: (id: number) => string;
/**
 * @summary Update a pending daily rate (manager only, while pending)
 */
export declare const updateDiaria: (id: number, diariaUpdate: DiariaUpdate, options?: RequestInit) => Promise<Diaria>;
export declare const getUpdateDiariaMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateDiaria>>, TError, {
        id: number;
        data: BodyType<DiariaUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateDiaria>>, TError, {
    id: number;
    data: BodyType<DiariaUpdate>;
}, TContext>;
export type UpdateDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof updateDiaria>>>;
export type UpdateDiariaMutationBody = BodyType<DiariaUpdate>;
export type UpdateDiariaMutationError = ErrorType<unknown>;
/**
* @summary Update a pending daily rate (manager only, while pending)
*/
export declare const useUpdateDiaria: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateDiaria>>, TError, {
        id: number;
        data: BodyType<DiariaUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateDiaria>>, TError, {
    id: number;
    data: BodyType<DiariaUpdate>;
}, TContext>;
export declare const getDeleteDiariaUrl: (id: number) => string;
/**
 * @summary Permanently delete a daily rate (admin only)
 */
export declare const deleteDiaria: (id: number, options?: RequestInit) => Promise<DiariaDeletionResult>;
export declare const getDeleteDiariaMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteDiaria>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteDiaria>>, TError, {
    id: number;
}, TContext>;
export type DeleteDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof deleteDiaria>>>;
export type DeleteDiariaMutationError = ErrorType<ErrorResponse>;
/**
* @summary Permanently delete a daily rate (admin only)
*/
export declare const useDeleteDiaria: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteDiaria>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteDiaria>>, TError, {
    id: number;
}, TContext>;
export declare const getRevertDiariaUrl: (id: number) => string;
/**
 * @summary Revert an eligible daily rate to pending review (admin only)
 */
export declare const revertDiaria: (id: number, options?: RequestInit) => Promise<Diaria>;
export declare const getRevertDiariaMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof revertDiaria>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof revertDiaria>>, TError, {
    id: number;
}, TContext>;
export type RevertDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof revertDiaria>>>;
export type RevertDiariaMutationError = ErrorType<ErrorResponse>;
/**
* @summary Revert an eligible daily rate to pending review (admin only)
*/
export declare const useRevertDiaria: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof revertDiaria>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof revertDiaria>>, TError, {
    id: number;
}, TContext>;
export declare const getApproveDiariaUrl: (id: number) => string;
/**
 * @summary Approve a daily rate (admin only)
 */
export declare const approveDiaria: (id: number, diariaActionNote?: DiariaActionNote, options?: RequestInit) => Promise<Diaria>;
export declare const getApproveDiariaMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof approveDiaria>>, TError, {
        id: number;
        data?: BodyType<DiariaActionNote>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof approveDiaria>>, TError, {
    id: number;
    data?: BodyType<DiariaActionNote>;
}, TContext>;
export type ApproveDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof approveDiaria>>>;
export type ApproveDiariaMutationBody = BodyType<DiariaActionNote> | undefined;
export type ApproveDiariaMutationError = ErrorType<unknown>;
/**
* @summary Approve a daily rate (admin only)
*/
export declare const useApproveDiaria: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof approveDiaria>>, TError, {
        id: number;
        data?: BodyType<DiariaActionNote>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof approveDiaria>>, TError, {
    id: number;
    data?: BodyType<DiariaActionNote>;
}, TContext>;
export declare const getRejectDiariaUrl: (id: number) => string;
/**
 * @summary Reject a daily rate (admin only)
 */
export declare const rejectDiaria: (id: number, diariaActionNote: DiariaActionNote, options?: RequestInit) => Promise<Diaria>;
export declare const getRejectDiariaMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof rejectDiaria>>, TError, {
        id: number;
        data: BodyType<DiariaActionNote>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof rejectDiaria>>, TError, {
    id: number;
    data: BodyType<DiariaActionNote>;
}, TContext>;
export type RejectDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof rejectDiaria>>>;
export type RejectDiariaMutationBody = BodyType<DiariaActionNote>;
export type RejectDiariaMutationError = ErrorType<unknown>;
/**
* @summary Reject a daily rate (admin only)
*/
export declare const useRejectDiaria: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof rejectDiaria>>, TError, {
        id: number;
        data: BodyType<DiariaActionNote>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof rejectDiaria>>, TError, {
    id: number;
    data: BodyType<DiariaActionNote>;
}, TContext>;
export declare const getRequestCorrectionDiariaUrl: (id: number) => string;
/**
 * @summary Request correction on a daily rate (admin only)
 */
export declare const requestCorrectionDiaria: (id: number, diariaActionNote: DiariaActionNote, options?: RequestInit) => Promise<Diaria>;
export declare const getRequestCorrectionDiariaMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof requestCorrectionDiaria>>, TError, {
        id: number;
        data: BodyType<DiariaActionNote>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof requestCorrectionDiaria>>, TError, {
    id: number;
    data: BodyType<DiariaActionNote>;
}, TContext>;
export type RequestCorrectionDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof requestCorrectionDiaria>>>;
export type RequestCorrectionDiariaMutationBody = BodyType<DiariaActionNote>;
export type RequestCorrectionDiariaMutationError = ErrorType<unknown>;
/**
* @summary Request correction on a daily rate (admin only)
*/
export declare const useRequestCorrectionDiaria: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof requestCorrectionDiaria>>, TError, {
        id: number;
        data: BodyType<DiariaActionNote>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof requestCorrectionDiaria>>, TError, {
    id: number;
    data: BodyType<DiariaActionNote>;
}, TContext>;
export declare const getMarkDiariaPaidUrl: (id: number) => string;
/**
 * @summary Mark a daily rate as paid (admin only)
 */
export declare const markDiariaPaid: (id: number, diariaActionNote?: DiariaActionNote, options?: RequestInit) => Promise<Diaria>;
export declare const getMarkDiariaPaidMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof markDiariaPaid>>, TError, {
        id: number;
        data?: BodyType<DiariaActionNote>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof markDiariaPaid>>, TError, {
    id: number;
    data?: BodyType<DiariaActionNote>;
}, TContext>;
export type MarkDiariaPaidMutationResult = NonNullable<Awaited<ReturnType<typeof markDiariaPaid>>>;
export type MarkDiariaPaidMutationBody = BodyType<DiariaActionNote> | undefined;
export type MarkDiariaPaidMutationError = ErrorType<unknown>;
/**
* @summary Mark a daily rate as paid (admin only)
*/
export declare const useMarkDiariaPaid: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof markDiariaPaid>>, TError, {
        id: number;
        data?: BodyType<DiariaActionNote>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof markDiariaPaid>>, TError, {
    id: number;
    data?: BodyType<DiariaActionNote>;
}, TContext>;
export declare const getExportDiariasUrl: () => string;
/**
 * @summary Export approved daily rates to DECARGO People (admin only)
 */
export declare const exportDiarias: (exportInput: ExportInput, options?: RequestInit) => Promise<ExportResult>;
export declare const getExportDiariasMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof exportDiarias>>, TError, {
        data: BodyType<ExportInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof exportDiarias>>, TError, {
    data: BodyType<ExportInput>;
}, TContext>;
export type ExportDiariasMutationResult = NonNullable<Awaited<ReturnType<typeof exportDiarias>>>;
export type ExportDiariasMutationBody = BodyType<ExportInput>;
export type ExportDiariasMutationError = ErrorType<unknown>;
/**
* @summary Export approved daily rates to DECARGO People (admin only)
*/
export declare const useExportDiarias: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof exportDiarias>>, TError, {
        data: BodyType<ExportInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof exportDiarias>>, TError, {
    data: BodyType<ExportInput>;
}, TContext>;
export declare const getListCompetencePeriodsUrl: () => string;
/**
 * @summary List competence registration periods (admin only)
 */
export declare const listCompetencePeriods: (options?: RequestInit) => Promise<CompetencePeriod[]>;
export declare const getListCompetencePeriodsQueryKey: () => readonly ["/api/competence-periods"];
export declare const getListCompetencePeriodsQueryOptions: <TData = Awaited<ReturnType<typeof listCompetencePeriods>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriods>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriods>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListCompetencePeriodsQueryResult = NonNullable<Awaited<ReturnType<typeof listCompetencePeriods>>>;
export type ListCompetencePeriodsQueryError = ErrorType<unknown>;
/**
 * @summary List competence registration periods (admin only)
 */
export declare function useListCompetencePeriods<TData = Awaited<ReturnType<typeof listCompetencePeriods>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriods>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateCompetencePeriodUrl: () => string;
/**
 * @summary Create a competence registration period (admin only)
 */
export declare const createCompetencePeriod: (competencePeriodInput: CompetencePeriodInput, options?: RequestInit) => Promise<CompetencePeriod>;
export declare const getCreateCompetencePeriodMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriod>>, TError, {
        data: BodyType<CompetencePeriodInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriod>>, TError, {
    data: BodyType<CompetencePeriodInput>;
}, TContext>;
export type CreateCompetencePeriodMutationResult = NonNullable<Awaited<ReturnType<typeof createCompetencePeriod>>>;
export type CreateCompetencePeriodMutationBody = BodyType<CompetencePeriodInput>;
export type CreateCompetencePeriodMutationError = ErrorType<unknown>;
/**
* @summary Create a competence registration period (admin only)
*/
export declare const useCreateCompetencePeriod: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriod>>, TError, {
        data: BodyType<CompetencePeriodInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createCompetencePeriod>>, TError, {
    data: BodyType<CompetencePeriodInput>;
}, TContext>;
export declare const getGetCompetenceWorkDateStatusUrl: (workDate: string) => string;
/**
 * @summary Get authenticated user's registration authorization for a work date
 */
export declare const getCompetenceWorkDateStatus: (workDate: string, options?: RequestInit) => Promise<CompetenceAuthorization>;
export declare const getGetCompetenceWorkDateStatusQueryKey: (workDate: string) => readonly [`/api/competence-periods/status/work-date/${string}`];
export declare const getGetCompetenceWorkDateStatusQueryOptions: <TData = Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>, TError = ErrorType<unknown>>(workDate: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCompetenceWorkDateStatusQueryResult = NonNullable<Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>>;
export type GetCompetenceWorkDateStatusQueryError = ErrorType<unknown>;
/**
 * @summary Get authenticated user's registration authorization for a work date
 */
export declare function useGetCompetenceWorkDateStatus<TData = Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>, TError = ErrorType<unknown>>(workDate: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateCompetencePeriodUrl: (id: number) => string;
/**
 * @summary Update a competence registration period (admin only)
 */
export declare const updateCompetencePeriod: (id: number, competencePeriodInput: CompetencePeriodInput, options?: RequestInit) => Promise<CompetencePeriod>;
export declare const getUpdateCompetencePeriodMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCompetencePeriod>>, TError, {
        id: number;
        data: BodyType<CompetencePeriodInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateCompetencePeriod>>, TError, {
    id: number;
    data: BodyType<CompetencePeriodInput>;
}, TContext>;
export type UpdateCompetencePeriodMutationResult = NonNullable<Awaited<ReturnType<typeof updateCompetencePeriod>>>;
export type UpdateCompetencePeriodMutationBody = BodyType<CompetencePeriodInput>;
export type UpdateCompetencePeriodMutationError = ErrorType<unknown>;
/**
* @summary Update a competence registration period (admin only)
*/
export declare const useUpdateCompetencePeriod: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCompetencePeriod>>, TError, {
        id: number;
        data: BodyType<CompetencePeriodInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateCompetencePeriod>>, TError, {
    id: number;
    data: BodyType<CompetencePeriodInput>;
}, TContext>;
export declare const getDeleteCompetencePeriodUrl: (id: number) => string;
/**
 * @summary Delete a competence registration period (admin only)
 */
export declare const deleteCompetencePeriod: (id: number, options?: RequestInit) => Promise<MessageResponse>;
export declare const getDeleteCompetencePeriodMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCompetencePeriod>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteCompetencePeriod>>, TError, {
    id: number;
}, TContext>;
export type DeleteCompetencePeriodMutationResult = NonNullable<Awaited<ReturnType<typeof deleteCompetencePeriod>>>;
export type DeleteCompetencePeriodMutationError = ErrorType<unknown>;
/**
* @summary Delete a competence registration period (admin only)
*/
export declare const useDeleteCompetencePeriod: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCompetencePeriod>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteCompetencePeriod>>, TError, {
    id: number;
}, TContext>;
export declare const getSetCompetencePeriodStatusUrl: (id: number, status: "open" | "close" | "reopen") => string;
/**
 * @summary Close, open, or reopen a competence period (admin only)
 */
export declare const setCompetencePeriodStatus: (id: number, status: "open" | "close" | "reopen", options?: RequestInit) => Promise<CompetencePeriod>;
export declare const getSetCompetencePeriodStatusMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof setCompetencePeriodStatus>>, TError, {
        id: number;
        status: "open" | "close" | "reopen";
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof setCompetencePeriodStatus>>, TError, {
    id: number;
    status: "open" | "close" | "reopen";
}, TContext>;
export type SetCompetencePeriodStatusMutationResult = NonNullable<Awaited<ReturnType<typeof setCompetencePeriodStatus>>>;
export type SetCompetencePeriodStatusMutationError = ErrorType<unknown>;
/**
* @summary Close, open, or reopen a competence period (admin only)
*/
export declare const useSetCompetencePeriodStatus: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof setCompetencePeriodStatus>>, TError, {
        id: number;
        status: "open" | "close" | "reopen";
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof setCompetencePeriodStatus>>, TError, {
    id: number;
    status: "open" | "close" | "reopen";
}, TContext>;
export declare const getListCompetencePeriodReleasesUrl: (id: number) => string;
/**
 * @summary List releases for a period with manager names (admin only)
 */
export declare const listCompetencePeriodReleases: (id: number, options?: RequestInit) => Promise<CompetenceRelease[]>;
export declare const getListCompetencePeriodReleasesQueryKey: (id: number) => readonly [`/api/competence-periods/${number}/releases`];
export declare const getListCompetencePeriodReleasesQueryOptions: <TData = Awaited<ReturnType<typeof listCompetencePeriodReleases>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriodReleases>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriodReleases>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListCompetencePeriodReleasesQueryResult = NonNullable<Awaited<ReturnType<typeof listCompetencePeriodReleases>>>;
export type ListCompetencePeriodReleasesQueryError = ErrorType<unknown>;
/**
 * @summary List releases for a period with manager names (admin only)
 */
export declare function useListCompetencePeriodReleases<TData = Awaited<ReturnType<typeof listCompetencePeriodReleases>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriodReleases>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateCompetencePeriodReleaseUrl: (id: number) => string;
/**
 * @summary Grant exceptional manager release (admin only)
 */
export declare const createCompetencePeriodRelease: (id: number, competenceReleaseInput: CompetenceReleaseInput, options?: RequestInit) => Promise<CompetenceRelease>;
export declare const getCreateCompetencePeriodReleaseMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriodRelease>>, TError, {
        id: number;
        data: BodyType<CompetenceReleaseInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriodRelease>>, TError, {
    id: number;
    data: BodyType<CompetenceReleaseInput>;
}, TContext>;
export type CreateCompetencePeriodReleaseMutationResult = NonNullable<Awaited<ReturnType<typeof createCompetencePeriodRelease>>>;
export type CreateCompetencePeriodReleaseMutationBody = BodyType<CompetenceReleaseInput>;
export type CreateCompetencePeriodReleaseMutationError = ErrorType<unknown>;
/**
* @summary Grant exceptional manager release (admin only)
*/
export declare const useCreateCompetencePeriodRelease: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriodRelease>>, TError, {
        id: number;
        data: BodyType<CompetenceReleaseInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createCompetencePeriodRelease>>, TError, {
    id: number;
    data: BodyType<CompetenceReleaseInput>;
}, TContext>;
export declare const getCancelCompetencePeriodReleaseUrl: (id: number, releaseId: number) => string;
/**
 * @summary Cancel exceptional manager release (admin only)
 */
export declare const cancelCompetencePeriodRelease: (id: number, releaseId: number, options?: RequestInit) => Promise<MessageResponse>;
export declare const getCancelCompetencePeriodReleaseMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof cancelCompetencePeriodRelease>>, TError, {
        id: number;
        releaseId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof cancelCompetencePeriodRelease>>, TError, {
    id: number;
    releaseId: number;
}, TContext>;
export type CancelCompetencePeriodReleaseMutationResult = NonNullable<Awaited<ReturnType<typeof cancelCompetencePeriodRelease>>>;
export type CancelCompetencePeriodReleaseMutationError = ErrorType<unknown>;
/**
* @summary Cancel exceptional manager release (admin only)
*/
export declare const useCancelCompetencePeriodRelease: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof cancelCompetencePeriodRelease>>, TError, {
        id: number;
        releaseId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof cancelCompetencePeriodRelease>>, TError, {
    id: number;
    releaseId: number;
}, TContext>;
export declare const getListAuditLogsUrl: (params?: ListAuditLogsParams) => string;
/**
 * @summary List audit log entries (admin only)
 */
export declare const listAuditLogs: (params?: ListAuditLogsParams, options?: RequestInit) => Promise<AuditPage>;
export declare const getListAuditLogsQueryKey: (params?: ListAuditLogsParams) => readonly ["/api/audit", ...ListAuditLogsParams[]];
export declare const getListAuditLogsQueryOptions: <TData = Awaited<ReturnType<typeof listAuditLogs>>, TError = ErrorType<unknown>>(params?: ListAuditLogsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listAuditLogs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listAuditLogs>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListAuditLogsQueryResult = NonNullable<Awaited<ReturnType<typeof listAuditLogs>>>;
export type ListAuditLogsQueryError = ErrorType<unknown>;
/**
 * @summary List audit log entries (admin only)
 */
export declare function useListAuditLogs<TData = Awaited<ReturnType<typeof listAuditLogs>>, TError = ErrorType<unknown>>(params?: ListAuditLogsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listAuditLogs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDashboardSummaryUrl: () => string;
/**
 * @summary Get dashboard summary counts and financial totals
 */
export declare const getDashboardSummary: (options?: RequestInit) => Promise<DashboardSummary>;
export declare const getGetDashboardSummaryQueryKey: () => readonly ["/api/dashboard/summary"];
export declare const getGetDashboardSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardSummary>>>;
export type GetDashboardSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Get dashboard summary counts and financial totals
 */
export declare function useGetDashboardSummary<TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDashboardByTeamUrl: () => string;
/**
 * @summary Get dashboard metrics grouped by team
 */
export declare const getDashboardByTeam: (options?: RequestInit) => Promise<TeamMetrics[]>;
export declare const getGetDashboardByTeamQueryKey: () => readonly ["/api/dashboard/by-team"];
export declare const getGetDashboardByTeamQueryOptions: <TData = Awaited<ReturnType<typeof getDashboardByTeam>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardByTeam>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboardByTeam>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardByTeamQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardByTeam>>>;
export type GetDashboardByTeamQueryError = ErrorType<unknown>;
/**
 * @summary Get dashboard metrics grouped by team
 */
export declare function useGetDashboardByTeam<TData = Awaited<ReturnType<typeof getDashboardByTeam>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardByTeam>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDashboardByProviderUrl: () => string;
/**
 * @summary Get dashboard metrics grouped by provider
 */
export declare const getDashboardByProvider: (options?: RequestInit) => Promise<ProviderMetrics[]>;
export declare const getGetDashboardByProviderQueryKey: () => readonly ["/api/dashboard/by-provider"];
export declare const getGetDashboardByProviderQueryOptions: <TData = Awaited<ReturnType<typeof getDashboardByProvider>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardByProvider>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboardByProvider>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardByProviderQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardByProvider>>>;
export type GetDashboardByProviderQueryError = ErrorType<unknown>;
/**
 * @summary Get dashboard metrics grouped by provider
 */
export declare function useGetDashboardByProvider<TData = Awaited<ReturnType<typeof getDashboardByProvider>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardByProvider>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetRecentActivityUrl: () => string;
/**
 * @summary Get recent diárias activity feed
 */
export declare const getRecentActivity: (options?: RequestInit) => Promise<ActivityItem[]>;
export declare const getGetRecentActivityQueryKey: () => readonly ["/api/dashboard/recent-activity"];
export declare const getGetRecentActivityQueryOptions: <TData = Awaited<ReturnType<typeof getRecentActivity>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetRecentActivityQueryResult = NonNullable<Awaited<ReturnType<typeof getRecentActivity>>>;
export type GetRecentActivityQueryError = ErrorType<unknown>;
/**
 * @summary Get recent diárias activity feed
 */
export declare function useGetRecentActivity<TData = Awaited<ReturnType<typeof getRecentActivity>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetReportDiariasUrl: (params?: GetReportDiariasParams) => string;
/**
 * @summary Detailed report of daily rates with filters
 */
export declare const getReportDiarias: (params?: GetReportDiariasParams, options?: RequestInit) => Promise<DiariasReport>;
export declare const getGetReportDiariasQueryKey: (params?: GetReportDiariasParams) => readonly ["/api/reports/diarias", ...GetReportDiariasParams[]];
export declare const getGetReportDiariasQueryOptions: <TData = Awaited<ReturnType<typeof getReportDiarias>>, TError = ErrorType<unknown>>(params?: GetReportDiariasParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getReportDiarias>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getReportDiarias>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetReportDiariasQueryResult = NonNullable<Awaited<ReturnType<typeof getReportDiarias>>>;
export type GetReportDiariasQueryError = ErrorType<unknown>;
/**
 * @summary Detailed report of daily rates with filters
 */
export declare function useGetReportDiarias<TData = Awaited<ReturnType<typeof getReportDiarias>>, TError = ErrorType<unknown>>(params?: GetReportDiariasParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getReportDiarias>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map