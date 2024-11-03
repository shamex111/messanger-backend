import { IsNumber, IsString } from "class-validator"

export class DeleteRoleDto {
    @IsString()
    roleName:string
    @IsNumber()
    channelId:number
}