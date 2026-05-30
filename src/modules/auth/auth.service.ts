import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/entities/user.entity';
import { OtpCode, OtpPurpose } from './entities/otp-code.entity';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SmsProvider } from '../notifications/providers/sms.provider';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(OtpCode)
    private otpRepository: Repository<OtpCode>,
    private jwtService: JwtService,
  ) {}

  async sendOtp(sendOtpDto: SendOtpDto) {
    const { phone } = sendOtpDto;

    // Générer un code OTP à 6 chiffres
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Expiration dans 10 minutes
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Trouver ou créer l'utilisateur
    let user = await this.usersRepository.findOne({ where: { phone } });
    if (!user) {
      user = this.usersRepository.create({ phone });
      await this.usersRepository.save(user);
    }

    // Invalider les anciens OTP
    await this.otpRepository.update(
      { user: { id: user.id }, isUsed: false },
      { isUsed: true }
    );

    // Créer le nouvel OTP
    const otp = this.otpRepository.create({
      user,
      code,
      purpose: OtpPurpose.LOGIN,
      expiresAt,
    });
    await this.otpRepository.save(otp);

    // Envoi SMS via Infobip
      const smsProvider = new SmsProvider();
      await smsProvider.sendOtp(phone, code);
      console.log(`OTP pour ${phone}: ${code}`);

    return {
      message: 'OTP envoyé avec succès',
      // En dev seulement — retirer en production !
      debug_code: process.env.NODE_ENV === 'development' ? code : undefined,
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { phone, code } = verifyOtpDto;

    // Trouver l'utilisateur
    const user = await this.usersRepository.findOne({ where: { phone } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }

    // Vérifier le code OTP
    const otp = await this.otpRepository.findOne({
      where: {
        user: { id: user.id },
        code,
        isUsed: false,
      },
    });

    if (!otp) {
      throw new UnauthorizedException('Code OTP invalide');
    }

    // Vérifier l'expiration
    if (new Date() > otp.expiresAt) {
      throw new UnauthorizedException('Code OTP expiré');
    }

    // Marquer l'OTP comme utilisé
    otp.isUsed = true;
    await this.otpRepository.save(otp);

    // Marquer l'utilisateur comme vérifié
    user.isVerified = true;
    await this.usersRepository.save(user);

    // Générer les tokens JWT
    const payload = { sub: user.id, phone: user.phone, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '30d' });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['addresses'],
    });
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }
    return user;
  }
}