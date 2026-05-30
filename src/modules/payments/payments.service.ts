import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, PaymentMethod, PaymentStatus } from './entities/transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { CinetpayWebhookDto } from './dto/cinetpay-webhook.dto';
import { CinetpayProvider } from './providers/cinetpay.provider';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(Wallet)
    private walletsRepository: Repository<Wallet>,
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private cinetpayProvider: CinetpayProvider,
  ) {}

  private async findUser(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return user;
  }

  private async findOrCreateWallet(userId: string): Promise<Wallet> {
    let wallet = await this.walletsRepository.findOne({
      where: { user: { id: userId } },
    });
    if (!wallet) {
      const user = await this.findUser(userId);
      wallet = new Wallet();
      wallet.user = user;
      wallet.balanceFcfa = 0;
      await this.walletsRepository.save(wallet);
    }
    return wallet;
  }

  async initiatePayment(userId: string, dto: InitiatePaymentDto) {
    const order = await this.ordersRepository.findOne({
      where: { id: dto.orderId, client: { id: userId } },
    });
    if (!order) throw new NotFoundException('Commande non trouvée');

    const user = await this.findUser(userId);

    if (dto.method === PaymentMethod.WALLET) {
      return this.payWithWallet(userId, order, dto.amount);
    }

    if (dto.method === PaymentMethod.CASH) {
      const transaction = new Transaction();
      transaction.order = order;
      transaction.user = user;
      transaction.method = PaymentMethod.CASH;
      transaction.status = PaymentStatus.PENDING;
      transaction.amountFcfa = dto.amount;
      return this.transactionsRepository.save(transaction);
    }

    const transactionId = `GEX-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const transaction = new Transaction();
    transaction.order = order;
    transaction.user = user;
    transaction.method = dto.method;
    transaction.status = PaymentStatus.PENDING;
    transaction.amountFcfa = dto.amount;
    transaction.providerRef = transactionId;
    await this.transactionsRepository.save(transaction);

    const cinetpayResponse = await this.cinetpayProvider.initiatePayment({
      transactionId,
      amount: dto.amount,
      description: `GazExpress - Commande ${order.id}`,
      customerName: user.fullName || user.phone,
      customerPhone: user.phone,
    });

    return {
      transactionId,
      paymentUrl: cinetpayResponse?.data?.payment_url,
      status: 'pending',
      message: 'Rediriger le client vers paymentUrl pour finaliser le paiement',
    };
  }

  async payWithWallet(userId: string, order: Order, amount: number) {
    const wallet = await this.findOrCreateWallet(userId);

    if (wallet.balanceFcfa < amount) {
      throw new BadRequestException('Solde wallet insuffisant');
    }

    wallet.balanceFcfa -= amount;
    await this.walletsRepository.save(wallet);

    const user = await this.findUser(userId);

    const transaction = new Transaction();
    transaction.order = order;
    transaction.user = user;
    transaction.method = PaymentMethod.WALLET;
    transaction.status = PaymentStatus.SUCCESS;
    transaction.amountFcfa = amount;
    await this.transactionsRepository.save(transaction);

    order.status = OrderStatus.CONFIRMED;
    await this.ordersRepository.save(order);

    return { message: 'Paiement wallet réussi', balance: wallet.balanceFcfa };
  }

  async handleWebhook(dto: CinetpayWebhookDto) {
    const transaction = await this.transactionsRepository.findOne({
      where: { providerRef: dto.cpm_trans_id },
      relations: ['order'],
    });

    if (!transaction) return { message: 'Transaction non trouvée' };

    if (dto.cpm_result === '00' && dto.cpm_trans_status === 'ACCEPTED') {
      transaction.status = PaymentStatus.SUCCESS;
      transaction.order.status = OrderStatus.CONFIRMED;
      await this.ordersRepository.save(transaction.order);
    } else {
      transaction.status = PaymentStatus.FAILED;
    }

    await this.transactionsRepository.save(transaction);
    return { message: 'Webhook traité' };
  }

  async getMyTransactions(userId: string) {
    return this.transactionsRepository.find({
      where: { user: { id: userId } },
      relations: ['order'],
      order: { createdAt: 'DESC' },
    });
  }

  async getWallet(userId: string) {
    return this.findOrCreateWallet(userId);
  }

  async topUpWallet(userId: string, amount: number) {
    const wallet = await this.findOrCreateWallet(userId);
    wallet.balanceFcfa += amount;
    return this.walletsRepository.save(wallet);
  }
}