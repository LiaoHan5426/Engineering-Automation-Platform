import type { BoardApplicationRef, BoardDeliveryRequest, BoardDelivery } from '../src/index'

// Compile-time public DTO contract: request omission is valid, explicit null is not.
type Assert<T extends true> = T
export type ApplicationRefCannotBeNull = Assert<
  null extends BoardDeliveryRequest['applicationRef'] ? false : true
>
export type ApplicationRefCanBeOmitted = Assert<
  undefined extends BoardDeliveryRequest['applicationRef'] ? true : false
>
export type ApplicationRefHasExactShape = Assert<
  Exclude<BoardDeliveryRequest['applicationRef'], undefined> extends BoardApplicationRef
    ? true
    : false
>
export type LegacyDeliveryCanLackEvidence = Assert<
  null extends BoardDelivery['applicationEvidence'] ? true : false
>
