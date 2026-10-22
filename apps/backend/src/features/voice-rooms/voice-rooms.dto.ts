import { createZodDto } from 'nestjs-zod';
import {
  callAcceptPayloadSchema,
  callGetActivePayloadSchema,
  callHangupPayloadSchema,
  callInitiatePayloadSchema,
  callRejectPayloadSchema,
  voiceRoomCloseConsumerSchema,
  voiceRoomCloseProducerSchema,
  voiceRoomConnectTransportSchema,
  voiceRoomConsumeSchema,
  voiceRoomCreateTransportSchema,
  voiceRoomJoinSchema,
  voiceRoomProduceSchema,
  voiceRoomRestartIceSchema,
  voiceRoomSetMuteStateSchema,
} from '@konvoez/shared';

export class VoiceRoomJoinDto extends createZodDto(voiceRoomJoinSchema) {}

export class VoiceRoomCreateTransportDto extends createZodDto(
  voiceRoomCreateTransportSchema,
) {}

export class VoiceRoomConnectTransportDto extends createZodDto(
  voiceRoomConnectTransportSchema,
) {}

export class VoiceRoomRestartIceDto extends createZodDto(
  voiceRoomRestartIceSchema,
) {}

export class VoiceRoomProduceDto extends createZodDto(voiceRoomProduceSchema) {}

export class VoiceRoomCloseProducerDto extends createZodDto(
  voiceRoomCloseProducerSchema,
) {}

export class VoiceRoomConsumeDto extends createZodDto(voiceRoomConsumeSchema) {}

export class VoiceRoomCloseConsumerDto extends createZodDto(
  voiceRoomCloseConsumerSchema,
) {}

export class VoiceRoomSetMuteStateDto extends createZodDto(
  voiceRoomSetMuteStateSchema,
) {}

export class CallInitiateDto extends createZodDto(callInitiatePayloadSchema) {}

export class CallAcceptDto extends createZodDto(callAcceptPayloadSchema) {}

export class CallRejectDto extends createZodDto(callRejectPayloadSchema) {}

export class CallHangupDto extends createZodDto(callHangupPayloadSchema) {}

export class CallGetActiveDto extends createZodDto(
  callGetActivePayloadSchema,
) {}
