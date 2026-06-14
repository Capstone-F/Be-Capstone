import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../auth/roles.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Immutable Keycloak user ID (sub claim). Always use this as foreign key. */
  @Column({ unique: true })
  keycloakSub: string;

  @Column({ nullable: true, type: 'varchar' })
  email: string | null;

  @Column({ nullable: true, type: 'varchar' })
  name: string | null;

  /**
   * Identity provider used on first login.
   * e.g. 'google', 'keycloak' (local account).
   */
  @Column({ default: 'keycloak' })
  provider: string;

  /** Mirrored application roles from Keycloak (comma-separated in DB). */
  @Column('simple-array', { default: Role.Customer })
  roles: Role[];

  /** Partner clinic binding for expert / clinic_manager. */
  @Column({ nullable: true, type: 'uuid' })
  clinicId: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
