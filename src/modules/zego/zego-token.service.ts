import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppConfigService } from '../../config/config.service';
import { ConsultationRequest } from '../../consultations/consultation-request.entity';
import { User } from '../../users/user.entity';
import { ChatTokenResponseDto } from './dto/chat-token-response.dto';
import { VideoTokenResponseDto } from './dto/video-token-response.dto';
import { generateToken04 } from './zego-server-assistant';

const TOKEN_TTL_SECONDS = 7200;

@Injectable()
export class ZegoTokenService {
  constructor(
    @InjectRepository(ConsultationRequest)
    private readonly consultationRepository: Repository<ConsultationRequest>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly config: AppConfigService,
  ) {}

  async generateVideoToken(
    userId: string,
    bookingId: string,
  ): Promise<VideoTokenResponseDto> {
    const consultation = await this.consultationRepository.findOne({
      where: { id: bookingId },
      relations: ['customer', 'expert'],
    });
    if (!consultation) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    const customerUserId = consultation.customer?.userId;
    const expertUserId = consultation.expert?.userId;
    if (userId !== customerUserId && userId !== expertUserId) {
      throw new ForbiddenException(
        'Only the assigned customer or expert can join this consultation call',
      );
    }

    const { appID, serverSecret } = this.requireZegoCredentials();

    const roomID = `consult_${bookingId}`;
    const payload = JSON.stringify({
      room_id: roomID,
      privilege: {
        '1': 1,
        '2': 1,
      },
    });

    const token = generateToken04(
      appID,
      userId,
      serverSecret,
      TOKEN_TTL_SECONDS,
      payload,
    );

    const user = await this.userRepository.findOne({ where: { id: userId } });
    const userName = user?.name?.trim() || userId;

    return {
      appID,
      token,
      roomID,
      userID: userId,
      userName,
    };
  }

  async generateChatToken(
    userId: string,
    bookingId: string,
  ): Promise<ChatTokenResponseDto> {
    const consultation = await this.consultationRepository.findOne({
      where: { id: bookingId },
      relations: ['customer', 'expert'],
    });
    if (!consultation) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    const customerUserId = consultation.customer?.userId;
    const expertUserId = consultation.expert?.userId;
    if (userId !== customerUserId && userId !== expertUserId) {
      throw new ForbiddenException(
        'Only the assigned customer or expert can open this consultation chat',
      );
    }

    let peerUserID: string | undefined;
    if (userId === customerUserId) {
      peerUserID = expertUserId;
      if (!peerUserID) {
        throw new ConflictException('No expert assigned to this booking yet');
      }
    } else {
      peerUserID = customerUserId;
      if (!peerUserID) {
        throw new ConflictException('Booking customer is missing');
      }
    }

    const { appID, serverSecret } = this.requireZegoCredentials();

    // ZIM SDK strictly limits userID length to <= 32 bytes.
    const zimUserId = userId.replace(/-/g, '').slice(0, 32);
    const zimPeerUserId = peerUserID.replace(/-/g, '').slice(0, 32);

    const token = generateToken04(
      appID,
      zimUserId,
      serverSecret,
      TOKEN_TTL_SECONDS,
      '',
    );

    const users = await this.userRepository.find({
      where: { id: In([userId, peerUserID]) },
    });
    const nameById = new Map(
      users.map((u) => [u.id, u.name?.trim() || u.id] as const),
    );

    return {
      appID,
      token,
      userID: zimUserId,
      userName: nameById.get(userId) || userId,
      peerUserID: zimPeerUserId,
      peerUserName: nameById.get(peerUserID) || peerUserID,
    };
  }

  private requireZegoCredentials(): { appID: number; serverSecret: string } {
    const appIdRaw = this.config.zegoAppId;
    const serverSecret = this.config.zegoServerSecret;
    if (!appIdRaw || !serverSecret) {
      throw new ServiceUnavailableException(
        'ZegoCloud is not configured (ZEGO_APP_ID / ZEGO_SERVER_SECRET)',
      );
    }
    if (serverSecret.length !== 32) {
      throw new ServiceUnavailableException(
        'ZEGO_SERVER_SECRET must be a 32-byte string',
      );
    }

    const appID = Number(appIdRaw);
    if (!Number.isFinite(appID) || appID <= 0) {
      throw new ServiceUnavailableException('ZEGO_APP_ID is invalid');
    }

    return { appID, serverSecret };
  }
}
