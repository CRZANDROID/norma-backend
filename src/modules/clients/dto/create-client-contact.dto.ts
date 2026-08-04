import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateClientContactDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(7)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
