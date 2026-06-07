import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/entities/user.entity';
import { OtpCode, OtpPurpose } from './entities/otp-code.entity';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SmsProvider } from '../notifications/providers/sms.provider';
import * as admin from 'firebase-admin';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(OtpCode)
    private otpRepository: Repository<OtpCode>,
    private jwtService: JwtService,
  ) {
    // Initialiser Firebase Admin si pas déjà fait
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
  }

  async sendOtp(sendOtpDto: SendOtpDto) {
    const { phone } = sendOtpDto;

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    let user = await this.usersRepository.findOne({ where: { phone } });
    if (!user) {
      user = this.usersRepository.create({ phone });
      await this.usersRepository.save(user);
    }

    await this.otpRepository.update(
      { user: { id: user.id }, isUsed: false },
      { isUsed: true }
    );

    const otp = this.otpRepository.create({
      user,
      code,
      purpose: OtpPurpose.LOGIN,
      expiresAt,
    });
    await this.otpRepository.save(otp);

    const smsProvider = new SmsProvider();
    await smsProvider.sendOtp(phone, code);
    console.log(`OTP pour ${phone}: ${code}`);

    return {
      message: 'OTP envoyé avec succès',
      debug_code: process.env.NODE_ENV === 'development' ? code : undefined,
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { phone, code } = verifyOtpDto;

    const user = await this.usersRepository.findOne({ where: { phone } });
    if (!user) throw new UnauthorizedException('Utilisateur non trouvé');

    const otp = await this.otpRepository.findOne({
      where: { user: { id: user.id }, code, isUsed: false },
    });
    if (!otp) throw new UnauthorizedException('Code OTP invalide');

    if (new Date() > otp.expiresAt) throw new UnauthorizedException('Code OTP expiré');

    otp.isUsed = true;
    await this.otpRepository.save(otp);

    user.isVerified = true;
    await this.usersRepository.save(user);

    const payload = { sub: user.id, phone: user.phone, role: user.role };
    const accessToken  = this.jwtService.sign(payload);
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

  async loginWithFirebase(firebaseToken: string, phone: string) {
    // Vérifier le token Firebase
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    if (!decodedToken) throw new UnauthorizedException('Token Firebase invalide');

    // Trouver ou créer l'utilisateur
    let user = await this.usersRepository.findOne({ where: { phone } });
    if (!user) {
      user = this.usersRepository.create({ phone, isVerified: true });
      await this.usersRepository.save(user);
    } else {
      user.isVerified = true;
      await this.usersRepository.save(user);
    }

    // Générer les tokens JWT
    const payload = { sub: user.id, phone: user.phone, role: user.role };
    const accessToken  = this.jwtService.sign(payload);
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
    if (!user) throw new UnauthorizedException('Utilisateur non trouvé');
    return user;
  }
}