import React from 'react';
import type { IPoint } from '../../annotations';

export interface ISignatureBoxProps {
  id: string;
  position: IPoint;
  imageDataUrl: string;
  width: number;
  height: number;
}

export const SignatureBox: React.FC<ISignatureBoxProps> = ({
  id,
  position,
  imageDataUrl,
  width,
  height,
}) => {
  return (
    <img
      key={id}
      src={imageDataUrl}
      alt="Signature"
      className="absolute pointer-events-auto"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${width}px`,
        height: `${height}px`,
        objectFit: 'contain',
      }}
      draggable={false}
    />
  );
};
