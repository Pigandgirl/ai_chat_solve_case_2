import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { userService } from '../services/jsonDB';

export const register = async (req: Request, res: Response) => {
  try {
    const { username, password, phone, email } = req.body;

    const existingUser = userService.findOne({ username }) || userService.findOne({ phone });
    
    if (existingUser) {
      return res.status(400).json({ message: '用户名或手机号已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = userService.create({
      username,
      password: hashedPassword,
      phone,
      email
    });

    res.status(201).json({ message: '注册成功', user: { id: user._id, username, phone } });
  } catch (error) {
    res.status(500).json({ message: '注册失败', error });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    const user = userService.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: '用户名或密码错误' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: '用户名或密码错误' });
    }

    const token = jwt.sign({ userId: user._id }, config.jwtSecret as any, { expiresIn: config.jwtExpiresIn } as any);
    res.json({ 
      message: '登录成功', 
      token,
      user: { id: user._id, username: user.username, phone: user.phone }
    });
  } catch (error) {
    res.status(500).json({ message: '登录失败', error });
  }
};

export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    res.status(500).json({ message: '获取用户信息失败', error });
  }
};