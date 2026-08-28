.options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(bulkSetPaymentDateInput)
  }
);}





export const getBulkSetDiariaPaymentDateMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof bulkSetDiariaPaymentDate>>, TError,{data: BodyType<BulkSetPaymentDateInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof bulkSetDiariaPaymentDate>>, TError,{data: BodyType<BulkSetPaymentDateInput>}, TContext> => {

const mutationKey = ['bulkSetDiariaPaymentDate'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof bulkSetDiariaPaymentDate>>, {data: BodyType<BulkSetPaymentDateInput>}> = (props) => {
          const {data} = props ?? {};

          return  bulkSetDiariaPaymentDate(data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type BulkSetDiariaPaymentDateMutationResult = NonNullable<Awaited<ReturnType<typeof bulkSetDiariaPaymentDate>>>
    export type BulkSetDiariaPaymentDateMutationBody = BodyType<BulkSetPaymentDateInput>
    export type BulkSetDiariaPaymentDateMutationError = ErrorType<unknown>

    /**
 * @summary Apply a payment date to multiple daily rates at once (admin only)
 */
export const useBulkSetDiariaPaymentDate = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof bulkSetDiariaPaymentDate>>, TError,{data: BodyType<BulkSetPaymentDateInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof bulkSetDiariaPaymentDate>>,
        TError,
        {data: BodyType<BulkSetPaymentDateInput>},
        TContext
      > => {
      return useMutation(getBulkSetDiariaPaymentDateMutationOptions(options));
    }

export const getSetDiariaPaymentDateUrl = (id: number,) => {




  return `/api/diarias/${id}/payment-date`
}

/**
 * @summary Set/update the payment date of a daily rate (admin only, blocked after export)
 */
export const setDiariaPaymentDate = async (id: number,
    paymentDateInput: PaymentDateInput, options?: RequestInit): Promise<Diaria> => {

  return customFetch<Diaria>(getSetDiariaPaymentDateUrl(id),
  {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(paymentDateInput)
  }
);}





export const getSetDiariaPaymentDateMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof setDiariaPaymentDate>>, TError,{id: number;data: BodyType<PaymentDateInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof setDiariaPaymentDate>>, TError,{id: number;data: BodyType<PaymentDateInput>}, TContext> => {

const mutationKey = ['setDiariaPaymentDate'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof setDiariaPaymentDate>>, {id: number;data: BodyType<PaymentDateInput>}> = (props) => {
          const {id,data} = props ?? {};

          return  setDiariaPaymentDate(id,data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type SetDiariaPaymentDateMutationResult = NonNullable<Awaited<ReturnType<typeof setDiariaPaymentDate>>>
    export type SetDiariaPaymentDateMutationBody = BodyType<PaymentDateInput>
    export type SetDiariaPaymentDateMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Set/update the payment date of a daily rate (admin only, blocked after export)
 */
export const useSetDiariaPaymentDate = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof setDiariaPaymentDate>>, TError,{id: number;data: BodyType<PaymentDateInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof setDiariaPaymentDate>>,
        TError,
        {id: number;data: BodyType<PaymentDateInput>},
        TContext
      > => {
      return useMutation(getSetDiariaPaymentDateMutationOptions(options));
    }

export const getGetDiariaUrl = (id: number,) => {




  return `/api/diarias/${id}`
}

/**
 * @summary Get a daily rate by ID
 */
export const getDiaria = async (id: number, options?: RequestInit): Promise<Diaria> => {

  return customFetch<Diaria>(getGetDiariaUrl(id),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetDiariaQueryKey = (id: number,) => {
    return [
    `/api/diarias/${id}`
    ] as const;
    }


export const getGetDiariaQueryOptions = <TData = Awaited<ReturnType<typeof getDiaria>>, TError = ErrorType<ErrorResponse>>(id: number, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getDiaria>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetDiariaQueryKey(id);



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getDiaria>>> = ({ signal }) => getDiaria(id, { signal, ...requestOptions });





   return  { queryKey, queryFn, enabled: id !== null && id !== undefined, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getDiaria>>, TError, TData> & { queryKey: QueryKey }
}

export type GetDiariaQueryResult = NonNullable<Awaited<ReturnType<typeof getDiaria>>>
export type GetDiariaQueryError = ErrorType<ErrorResponse>


/**
 * @summary Get a daily rate by ID
 */

export function useGetDiaria<TData = Awaited<ReturnType<typeof getDiaria>>, TError = ErrorType<ErrorResponse>>(
 id: number, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getDiaria>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetDiariaQueryOptions(id,options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getUpdateDiariaUrl = (id: number,) => {




  return `/api/diarias/${id}`
}

/**
 * @summary Update a pending daily rate (manager only, while pending)
 */
export const updateDiaria = async (id: number,
    diariaUpdate: DiariaUpdate, options?: RequestInit): Promise<Diaria> => {

  return customFetch<Diaria>(getUpdateDiariaUrl(id),
  {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(diariaUpdate)
  }
);}





export const getUpdateDiariaMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof updateDiaria>>, TError,{id: number;data: BodyType<DiariaUpdate>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof updateDiaria>>, TError,{id: number;data: BodyType<DiariaUpdate>}, TContext> => {

const mutationKey = ['updateDiaria'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof updateDiaria>>, {id: number;data: BodyType<DiariaUpdate>}> = (props) => {
          const {id,data} = props ?? {};

          return  updateDiaria(id,data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type UpdateDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof updateDiaria>>>
    export type UpdateDiariaMutationBody = BodyType<DiariaUpdate>
    export type UpdateDiariaMutationError = ErrorType<unknown>

    /**
 * @summary Update a pending daily rate (manager only, while pending)
 */
export const useUpdateDiaria = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof updateDiaria>>, TError,{id: number;data: BodyType<DiariaUpdate>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof updateDiaria>>,
        TError,
        {id: number;data: BodyType<DiariaUpdate>},
        TContext
      > => {
      return useMutation(getUpdateDiariaMutationOptions(options));
    }

export const getDeleteDiariaUrl = (id: number,) => {




  return `/api/diarias/${id}`
}

/**
 * @summary Permanently delete a daily rate (admin only)
 */
export const deleteDiaria = async (id: number, options?: RequestInit): Promise<DiariaDeletionResult> => {

  return customFetch<DiariaDeletionResult>(getDeleteDiariaUrl(id),
  {
    ...options,
    method: 'DELETE'


  }
);}





export const getDeleteDiariaMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof deleteDiaria>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof deleteDiaria>>, TError,{id: number}, TContext> => {

const mutationKey = ['deleteDiaria'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof deleteDiaria>>, {id: number}> = (props) => {
          const {id} = props ?? {};

          return  deleteDiaria(id,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type DeleteDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof deleteDiaria>>>

    export type DeleteDiariaMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Permanently delete a daily rate (admin only)
 */
export const useDeleteDiaria = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof deleteDiaria>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof deleteDiaria>>,
        TError,
        {id: number},
        TContext
      > => {
      return useMutation(getDeleteDiariaMutationOptions(options));
    }

export const getRevertDiariaUrl = (id: number,) => {




  return `/api/diarias/${id}/revert`
}

/**
 * @summary Revert an eligible daily rate to pending review (admin only)
 */
export const revertDiaria = async (id: number, options?: RequestInit): Promise<Diaria> => {

  return customFetch<Diaria>(getRevertDiariaUrl(id),
  {
    ...options,
    method: 'POST'


  }
);}





export const getRevertDiariaMutationOptions = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof revertDiaria>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof revertDiaria>>, TError,{id: number}, TContext> => {

const mutationKey = ['revertDiaria'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof revertDiaria>>, {id: number}> = (props) => {
          const {id} = props ?? {};

          return  revertDiaria(id,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type RevertDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof revertDiaria>>>

    export type RevertDiariaMutationError = ErrorType<ErrorResponse>

    /**
 * @summary Revert an eligible daily rate to pending review (admin only)
 */
export const useRevertDiaria = <TError = ErrorType<ErrorResponse>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof revertDiaria>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof revertDiaria>>,
        TError,
        {id: number},
        TContext
      > => {
      return useMutation(getRevertDiariaMutationOptions(options));
    }

export const getApproveDiariaUrl = (id: number,) => {




  return `/api/diarias/${id}/approve`
}

/**
 * @summary Approve a daily rate (admin only)
 */
export const approveDiaria = async (id: number,
    diariaActionNote?: DiariaActionNote, options?: RequestInit): Promise<Diaria> => {

  return customFetch<Diaria>(getApproveDiariaUrl(id),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(diariaActionNote)
  }
);}





export const getApproveDiariaMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof approveDiaria>>, TError,{id: number;data?: BodyType<DiariaActionNote>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof approveDiaria>>, TError,{id: number;data?: BodyType<DiariaActionNote>}, TContext> => {

const mutationKey = ['approveDiaria'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof approveDiaria>>, {id: number;data?: BodyType<DiariaActionNote>}> = (props) => {
          const {id,data} = props ?? {};

          return  approveDiaria(id,data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type ApproveDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof approveDiaria>>>
    export type ApproveDiariaMutationBody = BodyType<DiariaActionNote> | undefined
    export type ApproveDiariaMutationError = ErrorType<unknown>

    /**
 * @summary Approve a daily rate (admin only)
 */
export const useApproveDiaria = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof approveDiaria>>, TError,{id: number;data?: BodyType<DiariaActionNote>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof approveDiaria>>,
        TError,
        {id: number;data?: BodyType<DiariaActionNote>},
        TContext
      > => {
      return useMutation(getApproveDiariaMutationOptions(options));
    }

export const getRejectDiariaUrl = (id: number,) => {




  return `/api/diarias/${id}/reject`
}

/**
 * @summary Reject a daily rate (admin only)
 */
export const rejectDiaria = async (id: number,
    diariaActionNote: DiariaActionNote, options?: RequestInit): Promise<Diaria> => {

  return customFetch<Diaria>(getRejectDiariaUrl(id),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(diariaActionNote)
  }
);}





export const getRejectDiariaMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof rejectDiaria>>, TError,{id: number;data: BodyType<DiariaActionNote>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof rejectDiaria>>, TError,{id: number;data: BodyType<DiariaActionNote>}, TContext> => {

const mutationKey = ['rejectDiaria'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof rejectDiaria>>, {id: number;data: BodyType<DiariaActionNote>}> = (props) => {
          const {id,data} = props ?? {};

          return  rejectDiaria(id,data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type RejectDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof rejectDiaria>>>
    export type RejectDiariaMutationBody = BodyType<DiariaActionNote>
    export type RejectDiariaMutationError = ErrorType<unknown>

    /**
 * @summary Reject a daily rate (admin only)
 */
export const useRejectDiaria = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof rejectDiaria>>, TError,{id: number;data: BodyType<DiariaActionNote>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof rejectDiaria>>,
        TError,
        {id: number;data: BodyType<DiariaActionNote>},
        TContext
      > => {
      return useMutation(getRejectDiariaMutationOptions(options));
    }

export const getRequestCorrectionDiariaUrl = (id: number,) => {




  return `/api/diarias/${id}/request-correction`
}

/**
 * @summary Request correction on a daily rate (admin only)
 */
export const requestCorrectionDiaria = async (id: number,
    diariaActionNote: DiariaActionNote, options?: RequestInit): Promise<Diaria> => {

  return customFetch<Diaria>(getRequestCorrectionDiariaUrl(id),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(diariaActionNote)
  }
);}





export const getRequestCorrectionDiariaMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof requestCorrectionDiaria>>, TError,{id: number;data: BodyType<DiariaActionNote>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof requestCorrectionDiaria>>, TError,{id: number;data: BodyType<DiariaActionNote>}, TContext> => {

const mutationKey = ['requestCorrectionDiaria'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof requestCorrectionDiaria>>, {id: number;data: BodyType<DiariaActionNote>}> = (props) => {
          const {id,data} = props ?? {};

          return  requestCorrectionDiaria(id,data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type RequestCorrectionDiariaMutationResult = NonNullable<Awaited<ReturnType<typeof requestCorrectionDiaria>>>
    export type RequestCorrectionDiariaMutationBody = BodyType<DiariaActionNote>
    export type RequestCorrectionDiariaMutationError = ErrorType<unknown>

    /**
 * @summary Request correction on a daily rate (admin only)
 */
export const useRequestCorrectionDiaria = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof requestCorrectionDiaria>>, TError,{id: number;data: BodyType<DiariaActionNote>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof requestCorrectionDiaria>>,
        TError,
        {id: number;data: BodyType<DiariaActionNote>},
        TContext
      > => {
      return useMutation(getRequestCorrectionDiariaMutationOptions(options));
    }

export const getMarkDiariaPaidUrl = (id: number,) => {




  return `/api/diarias/${id}/mark-paid`
}

/**
 * @summary Mark a daily rate as paid (admin only)
 */
export const markDiariaPaid = async (id: number,
    diariaActionNote?: DiariaActionNote, options?: RequestInit): Promise<Diaria> => {

  return customFetch<Diaria>(getMarkDiariaPaidUrl(id),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(diariaActionNote)
  }
);}





export const getMarkDiariaPaidMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof markDiariaPaid>>, TError,{id: number;data?: BodyType<DiariaActionNote>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof markDiariaPaid>>, TError,{id: number;data?: BodyType<DiariaActionNote>}, TContext> => {

const mutationKey = ['markDiariaPaid'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof markDiariaPaid>>, {id: number;data?: BodyType<DiariaActionNote>}> = (props) => {
          const {id,data} = props ?? {};

          return  markDiariaPaid(id,data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type MarkDiariaPaidMutationResult = NonNullable<Awaited<ReturnType<typeof markDiariaPaid>>>
    export type MarkDiariaPaidMutationBody = BodyType<DiariaActionNote> | undefined
    export type MarkDiariaPaidMutationError = ErrorType<unknown>

    /**
 * @summary Mark a daily rate as paid (admin only)
 */
export const useMarkDiariaPaid = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof markDiariaPaid>>, TError,{id: number;data?: BodyType<DiariaActionNote>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof markDiariaPaid>>,
        TError,
        {id: number;data?: BodyType<DiariaActionNote>},
        TContext
      > => {
      return useMutation(getMarkDiariaPaidMutationOptions(options));
    }

export const getExportDiariasUrl = () => {




  return `/api/diarias/export`
}

/**
 * @summary Export approved daily rates to DECARGO People (admin only)
 */
export const exportDiarias = async (exportInput: ExportInput, options?: RequestInit): Promise<ExportResult> => {

  return customFetch<ExportResult>(getExportDiariasUrl(),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(exportInput)
  }
);}





export const getExportDiariasMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof exportDiarias>>, TError,{data: BodyType<ExportInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof exportDiarias>>, TError,{data: BodyType<ExportInput>}, TContext> => {

const mutationKey = ['exportDiarias'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof exportDiarias>>, {data: BodyType<ExportInput>}> = (props) => {
          const {data} = props ?? {};

          return  exportDiarias(data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type ExportDiariasMutationResult = NonNullable<Awaited<ReturnType<typeof exportDiarias>>>
    export type ExportDiariasMutationBody = BodyType<ExportInput>
    export type ExportDiariasMutationError = ErrorType<unknown>

    /**
 * @summary Export approved daily rates to DECARGO People (admin only)
 */
export const useExportDiarias = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof exportDiarias>>, TError,{data: BodyType<ExportInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof exportDiarias>>,
        TError,
        {data: BodyType<ExportInput>},
        TContext
      > => {
      return useMutation(getExportDiariasMutationOptions(options));
    }

export const getListCompetencePeriodsUrl = () => {




  return `/api/competence-periods`
}

/**
 * @summary List competence registration periods (admin only)
 */
export const listCompetencePeriods = async ( options?: RequestInit): Promise<CompetencePeriod[]> => {

  return customFetch<CompetencePeriod[]>(getListCompetencePeriodsUrl(),
  {
    ...options,
    method: 'GET'


  }
);}





export const getListCompetencePeriodsQueryKey = () => {
    return [
    `/api/competence-periods`
    ] as const;
    }


export const getListCompetencePeriodsQueryOptions = <TData = Awaited<ReturnType<typeof listCompetencePeriods>>, TError = ErrorType<unknown>>( options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriods>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getListCompetencePeriodsQueryKey();



    const queryFn: QueryFunction<Awaited<ReturnType<typeof listCompetencePeriods>>> = ({ signal }) => listCompetencePeriods({ signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriods>>, TError, TData> & { queryKey: QueryKey }
}

export type ListCompetencePeriodsQueryResult = NonNullable<Awaited<ReturnType<typeof listCompetencePeriods>>>
export type ListCompetencePeriodsQueryError = ErrorType<unknown>


/**
 * @summary List competence registration periods (admin only)
 */

export function useListCompetencePeriods<TData = Awaited<ReturnType<typeof listCompetencePeriods>>, TError = ErrorType<unknown>>(
  options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriods>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getListCompetencePeriodsQueryOptions(options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getCreateCompetencePeriodUrl = () => {




  return `/api/competence-periods`
}

/**
 * @summary Create a competence registration period (admin only)
 */
export const createCompetencePeriod = async (competencePeriodInput: CompetencePeriodInput, options?: RequestInit): Promise<CompetencePeriod> => {

  return customFetch<CompetencePeriod>(getCreateCompetencePeriodUrl(),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(competencePeriodInput)
  }
);}





export const getCreateCompetencePeriodMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriod>>, TError,{data: BodyType<CompetencePeriodInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriod>>, TError,{data: BodyType<CompetencePeriodInput>}, TContext> => {

const mutationKey = ['createCompetencePeriod'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof createCompetencePeriod>>, {data: BodyType<CompetencePeriodInput>}> = (props) => {
          const {data} = props ?? {};

          return  createCompetencePeriod(data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type CreateCompetencePeriodMutationResult = NonNullable<Awaited<ReturnType<typeof createCompetencePeriod>>>
    export type CreateCompetencePeriodMutationBody = BodyType<CompetencePeriodInput>
    export type CreateCompetencePeriodMutationError = ErrorType<unknown>

    /**
 * @summary Create a competence registration period (admin only)
 */
export const useCreateCompetencePeriod = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriod>>, TError,{data: BodyType<CompetencePeriodInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof createCompetencePeriod>>,
        TError,
        {data: BodyType<CompetencePeriodInput>},
        TContext
      > => {
      return useMutation(getCreateCompetencePeriodMutationOptions(options));
    }

export const getGetCompetenceWorkDateStatusUrl = (workDate: string,) => {




  return `/api/competence-periods/status/work-date/${workDate}`
}

/**
 * @summary Get authenticated user's registration authorization for a work date
 */
export const getCompetenceWorkDateStatus = async (workDate: string, options?: RequestInit): Promise<CompetenceAuthorization> => {

  return customFetch<CompetenceAuthorization>(getGetCompetenceWorkDateStatusUrl(workDate),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetCompetenceWorkDateStatusQueryKey = (workDate: string,) => {
    return [
    `/api/competence-periods/status/work-date/${workDate}`
    ] as const;
    }


export const getGetCompetenceWorkDateStatusQueryOptions = <TData = Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>, TError = ErrorType<unknown>>(workDate: string, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetCompetenceWorkDateStatusQueryKey(workDate);



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>> = ({ signal }) => getCompetenceWorkDateStatus(workDate, { signal, ...requestOptions });





   return  { queryKey, queryFn, enabled: workDate !== null && workDate !== undefined, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>, TError, TData> & { queryKey: QueryKey }
}

export type GetCompetenceWorkDateStatusQueryResult = NonNullable<Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>>
export type GetCompetenceWorkDateStatusQueryError = ErrorType<unknown>


/**
 * @summary Get authenticated user's registration authorization for a work date
 */

export function useGetCompetenceWorkDateStatus<TData = Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>, TError = ErrorType<unknown>>(
 workDate: string, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getCompetenceWorkDateStatus>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetCompetenceWorkDateStatusQueryOptions(workDate,options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getUpdateCompetencePeriodUrl = (id: number,) => {




  return `/api/competence-periods/${id}`
}

/**
 * @summary Update a competence registration period (admin only)
 */
export const updateCompetencePeriod = async (id: number,
    competencePeriodInput: CompetencePeriodInput, options?: RequestInit): Promise<CompetencePeriod> => {

  return customFetch<CompetencePeriod>(getUpdateCompetencePeriodUrl(id),
  {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(competencePeriodInput)
  }
);}





export const getUpdateCompetencePeriodMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof updateCompetencePeriod>>, TError,{id: number;data: BodyType<CompetencePeriodInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof updateCompetencePeriod>>, TError,{id: number;data: BodyType<CompetencePeriodInput>}, TContext> => {

const mutationKey = ['updateCompetencePeriod'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof updateCompetencePeriod>>, {id: number;data: BodyType<CompetencePeriodInput>}> = (props) => {
          const {id,data} = props ?? {};

          return  updateCompetencePeriod(id,data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type UpdateCompetencePeriodMutationResult = NonNullable<Awaited<ReturnType<typeof updateCompetencePeriod>>>
    export type UpdateCompetencePeriodMutationBody = BodyType<CompetencePeriodInput>
    export type UpdateCompetencePeriodMutationError = ErrorType<unknown>

    /**
 * @summary Update a competence registration period (admin only)
 */
export const useUpdateCompetencePeriod = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof updateCompetencePeriod>>, TError,{id: number;data: BodyType<CompetencePeriodInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof updateCompetencePeriod>>,
        TError,
        {id: number;data: BodyType<CompetencePeriodInput>},
        TContext
      > => {
      return useMutation(getUpdateCompetencePeriodMutationOptions(options));
    }

export const getDeleteCompetencePeriodUrl = (id: number,) => {




  return `/api/competence-periods/${id}`
}

/**
 * @summary Delete a competence registration period (admin only)
 */
export const deleteCompetencePeriod = async (id: number, options?: RequestInit): Promise<MessageResponse> => {

  return customFetch<MessageResponse>(getDeleteCompetencePeriodUrl(id),
  {
    ...options,
    method: 'DELETE'


  }
);}





export const getDeleteCompetencePeriodMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof deleteCompetencePeriod>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof deleteCompetencePeriod>>, TError,{id: number}, TContext> => {

const mutationKey = ['deleteCompetencePeriod'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof deleteCompetencePeriod>>, {id: number}> = (props) => {
          const {id} = props ?? {};

          return  deleteCompetencePeriod(id,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type DeleteCompetencePeriodMutationResult = NonNullable<Awaited<ReturnType<typeof deleteCompetencePeriod>>>

    export type DeleteCompetencePeriodMutationError = ErrorType<unknown>

    /**
 * @summary Delete a competence registration period (admin only)
 */
export const useDeleteCompetencePeriod = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof deleteCompetencePeriod>>, TError,{id: number}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof deleteCompetencePeriod>>,
        TError,
        {id: number},
        TContext
      > => {
      return useMutation(getDeleteCompetencePeriodMutationOptions(options));
    }

export const getSetCompetencePeriodStatusUrl = (id: number,
    status: 'open' | 'close' | 'reopen',) => {




  return `/api/competence-periods/${id}/${status}`
}

/**
 * @summary Close, open, or reopen a competence period (admin only)
 */
export const setCompetencePeriodStatus = async (id: number,
    status: 'open' | 'close' | 'reopen', options?: RequestInit): Promise<CompetencePeriod> => {

  return customFetch<CompetencePeriod>(getSetCompetencePeriodStatusUrl(id,status),
  {
    ...options,
    method: 'POST'


  }
);}





export const getSetCompetencePeriodStatusMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof setCompetencePeriodStatus>>, TError,{id: number;status: 'open' | 'close' | 'reopen'}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof setCompetencePeriodStatus>>, TError,{id: number;status: 'open' | 'close' | 'reopen'}, TContext> => {

const mutationKey = ['setCompetencePeriodStatus'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof setCompetencePeriodStatus>>, {id: number;status: 'open' | 'close' | 'reopen'}> = (props) => {
          const {id,status} = props ?? {};

          return  setCompetencePeriodStatus(id,status,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type SetCompetencePeriodStatusMutationResult = NonNullable<Awaited<ReturnType<typeof setCompetencePeriodStatus>>>

    export type SetCompetencePeriodStatusMutationError = ErrorType<unknown>

    /**
 * @summary Close, open, or reopen a competence period (admin only)
 */
export const useSetCompetencePeriodStatus = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof setCompetencePeriodStatus>>, TError,{id: number;status: 'open' | 'close' | 'reopen'}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof setCompetencePeriodStatus>>,
        TError,
        {id: number;status: 'open' | 'close' | 'reopen'},
        TContext
      > => {
      return useMutation(getSetCompetencePeriodStatusMutationOptions(options));
    }

export const getListCompetencePeriodReleasesUrl = (id: number,) => {




  return `/api/competence-periods/${id}/releases`
}

/**
 * @summary List releases for a period with manager names (admin only)
 */
export const listCompetencePeriodReleases = async (id: number, options?: RequestInit): Promise<CompetenceRelease[]> => {

  return customFetch<CompetenceRelease[]>(getListCompetencePeriodReleasesUrl(id),
  {
    ...options,
    method: 'GET'


  }
);}





export const getListCompetencePeriodReleasesQueryKey = (id: number,) => {
    return [
    `/api/competence-periods/${id}/releases`
    ] as const;
    }


export const getListCompetencePeriodReleasesQueryOptions = <TData = Awaited<ReturnType<typeof listCompetencePeriodReleases>>, TError = ErrorType<unknown>>(id: number, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriodReleases>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getListCompetencePeriodReleasesQueryKey(id);



    const queryFn: QueryFunction<Awaited<ReturnType<typeof listCompetencePeriodReleases>>> = ({ signal }) => listCompetencePeriodReleases(id, { signal, ...requestOptions });





   return  { queryKey, queryFn, enabled: id !== null && id !== undefined, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriodReleases>>, TError, TData> & { queryKey: QueryKey }
}

export type ListCompetencePeriodReleasesQueryResult = NonNullable<Awaited<ReturnType<typeof listCompetencePeriodReleases>>>
export type ListCompetencePeriodReleasesQueryError = ErrorType<unknown>


/**
 * @summary List releases for a period with manager names (admin only)
 */

export function useListCompetencePeriodReleases<TData = Awaited<ReturnType<typeof listCompetencePeriodReleases>>, TError = ErrorType<unknown>>(
 id: number, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof listCompetencePeriodReleases>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getListCompetencePeriodReleasesQueryOptions(id,options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getCreateCompetencePeriodReleaseUrl = (id: number,) => {




  return `/api/competence-periods/${id}/releases`
}

/**
 * @summary Grant exceptional manager release (admin only)
 */
export const createCompetencePeriodRelease = async (id: number,
    competenceReleaseInput: CompetenceReleaseInput, options?: RequestInit): Promise<CompetenceRelease> => {

  return customFetch<CompetenceRelease>(getCreateCompetencePeriodReleaseUrl(id),
  {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(competenceReleaseInput)
  }
);}





export const getCreateCompetencePeriodReleaseMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriodRelease>>, TError,{id: number;data: BodyType<CompetenceReleaseInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriodRelease>>, TError,{id: number;data: BodyType<CompetenceReleaseInput>}, TContext> => {

const mutationKey = ['createCompetencePeriodRelease'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof createCompetencePeriodRelease>>, {id: number;data: BodyType<CompetenceReleaseInput>}> = (props) => {
          const {id,data} = props ?? {};

          return  createCompetencePeriodRelease(id,data,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type CreateCompetencePeriodReleaseMutationResult = NonNullable<Awaited<ReturnType<typeof createCompetencePeriodRelease>>>
    export type CreateCompetencePeriodReleaseMutationBody = BodyType<CompetenceReleaseInput>
    export type CreateCompetencePeriodReleaseMutationError = ErrorType<unknown>

    /**
 * @summary Grant exceptional manager release (admin only)
 */
export const useCreateCompetencePeriodRelease = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof createCompetencePeriodRelease>>, TError,{id: number;data: BodyType<CompetenceReleaseInput>}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof createCompetencePeriodRelease>>,
        TError,
        {id: number;data: BodyType<CompetenceReleaseInput>},
        TContext
      > => {
      return useMutation(getCreateCompetencePeriodReleaseMutationOptions(options));
    }

export const getCancelCompetencePeriodReleaseUrl = (id: number,
    releaseId: number,) => {




  return `/api/competence-periods/${id}/releases/${releaseId}`
}

/**
 * @summary Cancel exceptional manager release (admin only)
 */
export const cancelCompetencePeriodRelease = async (id: number,
    releaseId: number, options?: RequestInit): Promise<MessageResponse> => {

  return customFetch<MessageResponse>(getCancelCompetencePeriodReleaseUrl(id,releaseId),
  {
    ...options,
    method: 'DELETE'


  }
);}





export const getCancelCompetencePeriodReleaseMutationOptions = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof cancelCompetencePeriodRelease>>, TError,{id: number;releaseId: number}, TContext>, request?: SecondParameter<typeof customFetch>}
): UseMutationOptions<Awaited<ReturnType<typeof cancelCompetencePeriodRelease>>, TError,{id: number;releaseId: number}, TContext> => {

const mutationKey = ['cancelCompetencePeriodRelease'];
const {mutation: mutationOptions, request: requestOptions} = options ?
      options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey ?
      options
      : {...options, mutation: {...options.mutation, mutationKey}}
      : {mutation: { mutationKey, }, request: undefined};




      const mutationFn: MutationFunction<Awaited<ReturnType<typeof cancelCompetencePeriodRelease>>, {id: number;releaseId: number}> = (props) => {
          const {id,releaseId} = props ?? {};

          return  cancelCompetencePeriodRelease(id,releaseId,requestOptions)
        }






  return  { mutationFn, ...mutationOptions }}

    export type CancelCompetencePeriodReleaseMutationResult = NonNullable<Awaited<ReturnType<typeof cancelCompetencePeriodRelease>>>

    export type CancelCompetencePeriodReleaseMutationError = ErrorType<unknown>

    /**
 * @summary Cancel exceptional manager release (admin only)
 */
export const useCancelCompetencePeriodRelease = <TError = ErrorType<unknown>,
    TContext = unknown>(options?: { mutation?:UseMutationOptions<Awaited<ReturnType<typeof cancelCompetencePeriodRelease>>, TError,{id: number;releaseId: number}, TContext>, request?: SecondParameter<typeof customFetch>}
 ): UseMutationResult<
        Awaited<ReturnType<typeof cancelCompetencePeriodRelease>>,
        TError,
        {id: number;releaseId: number},
        TContext
      > => {
      return useMutation(getCancelCompetencePeriodReleaseMutationOptions(options));
    }

export const getListAuditLogsUrl = (params?: ListAuditLogsParams,) => {
  const normalizedParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {

    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  });

  const stringifiedParams = normalizedParams.toString();

  return stringifiedParams.length > 0 ? `/api/audit?${stringifiedParams}` : `/api/audit`
}

/**
 * @summary List audit log entries (admin only)
 */
export const listAuditLogs = async (params?: ListAuditLogsParams, options?: RequestInit): Promise<AuditPage> => {

  return customFetch<AuditPage>(getListAuditLogsUrl(params),
  {
    ...options,
    method: 'GET'


  }
);}





export const getListAuditLogsQueryKey = (params?: ListAuditLogsParams,) => {
    return [
    `/api/audit`, ...(params ? [params] : [])
    ] as const;
    }


export const getListAuditLogsQueryOptions = <TData = Awaited<ReturnType<typeof listAuditLogs>>, TError = ErrorType<unknown>>(params?: ListAuditLogsParams, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof listAuditLogs>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getListAuditLogsQueryKey(params);



    const queryFn: QueryFunction<Awaited<ReturnType<typeof listAuditLogs>>> = ({ signal }) => listAuditLogs(params, { signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof listAuditLogs>>, TError, TData> & { queryKey: QueryKey }
}

export type ListAuditLogsQueryResult = NonNullable<Awaited<ReturnType<typeof listAuditLogs>>>
export type ListAuditLogsQueryError = ErrorType<unknown>


/**
 * @summary List audit log entries (admin only)
 */

export function useListAuditLogs<TData = Awaited<ReturnType<typeof listAuditLogs>>, TError = ErrorType<unknown>>(
 params?: ListAuditLogsParams, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof listAuditLogs>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getListAuditLogsQueryOptions(params,options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getGetDashboardSummaryUrl = () => {




  return `/api/dashboard/summary`
}

/**
 * @summary Get dashboard summary counts and financial totals
 */
export const getDashboardSummary = async ( options?: RequestInit): Promise<DashboardSummary> => {

  return customFetch<DashboardSummary>(getGetDashboardSummaryUrl(),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetDashboardSummaryQueryKey = () => {
    return [
    `/api/dashboard/summary`
    ] as const;
    }


export const getGetDashboardSummaryQueryOptions = <TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>( options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetDashboardSummaryQueryKey();



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getDashboardSummary>>> = ({ signal }) => getDashboardSummary({ signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData> & { queryKey: QueryKey }
}

export type GetDashboardSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardSummary>>>
export type GetDashboardSummaryQueryError = ErrorType<unknown>


/**
 * @summary Get dashboard summary counts and financial totals
 */

export function useGetDashboardSummary<TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(
  options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetDashboardSummaryQueryOptions(options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getGetDashboardByTeamUrl = () => {




  return `/api/dashboard/by-team`
}

/**
 * @summary Get dashboard metrics grouped by team
 */
export const getDashboardByTeam = async ( options?: RequestInit): Promise<TeamMetrics[]> => {

  return customFetch<TeamMetrics[]>(getGetDashboardByTeamUrl(),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetDashboardByTeamQueryKey = () => {
    return [
    `/api/dashboard/by-team`
    ] as const;
    }


export const getGetDashboardByTeamQueryOptions = <TData = Awaited<ReturnType<typeof getDashboardByTeam>>, TError = ErrorType<unknown>>( options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getDashboardByTeam>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetDashboardByTeamQueryKey();



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getDashboardByTeam>>> = ({ signal }) => getDashboardByTeam({ signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getDashboardByTeam>>, TError, TData> & { queryKey: QueryKey }
}

export type GetDashboardByTeamQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardByTeam>>>
export type GetDashboardByTeamQueryError = ErrorType<unknown>


/**
 * @summary Get dashboard metrics grouped by team
 */

export function useGetDashboardByTeam<TData = Awaited<ReturnType<typeof getDashboardByTeam>>, TError = ErrorType<unknown>>(
  options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getDashboardByTeam>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetDashboardByTeamQueryOptions(options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getGetDashboardByProviderUrl = () => {




  return `/api/dashboard/by-provider`
}

/**
 * @summary Get dashboard metrics grouped by provider
 */
export const getDashboardByProvider = async ( options?: RequestInit): Promise<ProviderMetrics[]> => {

  return customFetch<ProviderMetrics[]>(getGetDashboardByProviderUrl(),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetDashboardByProviderQueryKey = () => {
    return [
    `/api/dashboard/by-provider`
    ] as const;
    }


export const getGetDashboardByProviderQueryOptions = <TData = Awaited<ReturnType<typeof getDashboardByProvider>>, TError = ErrorType<unknown>>( options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getDashboardByProvider>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetDashboardByProviderQueryKey();



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getDashboardByProvider>>> = ({ signal }) => getDashboardByProvider({ signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getDashboardByProvider>>, TError, TData> & { queryKey: QueryKey }
}

export type GetDashboardByProviderQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardByProvider>>>
export type GetDashboardByProviderQueryError = ErrorType<unknown>


/**
 * @summary Get dashboard metrics grouped by provider
 */

export function useGetDashboardByProvider<TData = Awaited<ReturnType<typeof getDashboardByProvider>>, TError = ErrorType<unknown>>(
  options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getDashboardByProvider>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetDashboardByProviderQueryOptions(options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getGetRecentActivityUrl = () => {




  return `/api/dashboard/recent-activity`
}

/**
 * @summary Get recent diárias activity feed
 */
export const getRecentActivity = async ( options?: RequestInit): Promise<ActivityItem[]> => {

  return customFetch<ActivityItem[]>(getGetRecentActivityUrl(),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetRecentActivityQueryKey = () => {
    return [
    `/api/dashboard/recent-activity`
    ] as const;
    }


export const getGetRecentActivityQueryOptions = <TData = Awaited<ReturnType<typeof getRecentActivity>>, TError = ErrorType<unknown>>( options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetRecentActivityQueryKey();



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getRecentActivity>>> = ({ signal }) => getRecentActivity({ signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData> & { queryKey: QueryKey }
}

export type GetRecentActivityQueryResult = NonNullable<Awaited<ReturnType<typeof getRecentActivity>>>
export type GetRecentActivityQueryError = ErrorType<unknown>


/**
 * @summary Get recent diárias activity feed
 */

export function useGetRecentActivity<TData = Awaited<ReturnType<typeof getRecentActivity>>, TError = ErrorType<unknown>>(
  options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getRecentActivity>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetRecentActivityQueryOptions(options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







export const getGetReportDiariasUrl = (params?: GetReportDiariasParams,) => {
  const normalizedParams = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {

    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  });

  const stringifiedParams = normalizedParams.toString();

  return stringifiedParams.length > 0 ? `/api/reports/diarias?${stringifiedParams}` : `/api/reports/diarias`
}

/**
 * @summary Detailed report of daily rates with filters
 */
export const getReportDiarias = async (params?: GetReportDiariasParams, options?: RequestInit): Promise<DiariasReport> => {

  return customFetch<DiariasReport>(getGetReportDiariasUrl(params),
  {
    ...options,
    method: 'GET'


  }
);}





export const getGetReportDiariasQueryKey = (params?: GetReportDiariasParams,) => {
    return [
    `/api/reports/diarias`, ...(params ? [params] : [])
    ] as const;
    }


export const getGetReportDiariasQueryOptions = <TData = Awaited<ReturnType<typeof getReportDiarias>>, TError = ErrorType<unknown>>(params?: GetReportDiariasParams, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getReportDiarias>>, TError, TData>, request?: SecondParameter<typeof customFetch>}
) => {

const {query: queryOptions, request: requestOptions} = options ?? {};

  const queryKey =  queryOptions?.queryKey ?? getGetReportDiariasQueryKey(params);



    const queryFn: QueryFunction<Awaited<ReturnType<typeof getReportDiarias>>> = ({ signal }) => getReportDiarias(params, { signal, ...requestOptions });





   return  { queryKey, queryFn, ...queryOptions} as UseQueryOptions<Awaited<ReturnType<typeof getReportDiarias>>, TError, TData> & { queryKey: QueryKey }
}

export type GetReportDiariasQueryResult = NonNullable<Awaited<ReturnType<typeof getReportDiarias>>>
export type GetReportDiariasQueryError = ErrorType<unknown>


/**
 * @summary Detailed report of daily rates with filters
 */

export function useGetReportDiarias<TData = Awaited<ReturnType<typeof getReportDiarias>>, TError = ErrorType<unknown>>(
 params?: GetReportDiariasParams, options?: { query?:UseQueryOptions<Awaited<ReturnType<typeof getReportDiarias>>, TError, TData>, request?: SecondParameter<typeof customFetch>}

 ):  UseQueryResult<TData, TError> & { queryKey: QueryKey } {

  const queryOptions = getGetReportDiariasQueryOptions(params,options)

  const query = useQuery(queryOptions) as  UseQueryResult<TData, TError> & { queryKey: QueryKey };

  return withQueryKey(query, queryOptions.queryKey);
}







