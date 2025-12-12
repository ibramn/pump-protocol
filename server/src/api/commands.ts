/**
 * REST API Routes for Pump Commands
 */

import { Router, Request, Response } from 'express';
import { buildFrame } from '../protocol/line-protocol';
import { encodeCommandTransaction, CommandEncoders } from '../protocol/encoder';
import { CommandTransactionData, PumpAddress, SerialConfig } from '../types/protocol';
import { SerialHandler } from '../serial/serial-handler';

export function createCommandsRouter(serialHandler: SerialHandler) {
  const router = Router();

  /**
   * POST /api/commands/send
   * Send a command to the pump
   */
  router.post('/send', async (req: Request, res: Response) => {
    try {
      const { command, pumpAddress, control } = req.body;

      if (!command || !pumpAddress) {
        return res.status(400).json({
          error: 'Missing required fields: command, pumpAddress'
        });
      }

      // Validate pump address
      const address = parseInt(pumpAddress, 16);
      if (address < 0x50 || address > 0x6F) {
        return res.status(400).json({
          error: 'Invalid pump address. Must be between 0x50 and 0x6F'
        });
      }

      // Encode command transaction
      let transactionData: CommandTransactionData;
      try {
        transactionData = parseCommandRequest(command);
      } catch (error: any) {
        return res.status(400).json({
          error: `Invalid command: ${error.message}`
        });
      }

      // Encode transaction
      const transaction = encodeCommandTransaction(transactionData);

      // Build frame (control byte defaults to 0x00 if not provided)
      const frame = buildFrame(address, control || 0x00, [transaction]);

      // Send frame
      await serialHandler.sendFrame(frame);

      res.json({
        success: true,
        commandId: generateCommandId(),
        frame: {
          hex: frame.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
          bytes: frame
        }
      });
    } catch (error: any) {
      console.error('Error sending command:', error);
      res.status(500).json({
        error: error.message || 'Failed to send command'
      });
    }
  });

  /**
   * GET /api/status
   * Get current pump status
   */
  router.get('/status', (req: Request, res: Response) => {
    const config = serialHandler.getConfig();
    const connected = serialHandler.getConnectionStatus();

    res.json({
      connected,
      config: {
        port: config.port,
        baudRate: config.baudRate,
        pumpAddress: `0x${config.pumpAddress.toString(16).toUpperCase()}`
      }
    });
  });

  /**
   * POST /api/config
   * Update serial port configuration
   */
  router.post('/config', async (req: Request, res: Response) => {
    try {
      const { port, baudRate, pumpAddress } = req.body;

      if (!port || !baudRate || !pumpAddress) {
        return res.status(400).json({
          error: 'Missing required fields: port, baudRate, pumpAddress'
        });
      }

      // Parse pump address
      const address = typeof pumpAddress === 'string' 
        ? parseInt(pumpAddress, 16) 
        : pumpAddress;

      if (address < 0x50 || address > 0x6F) {
        return res.status(400).json({
          error: 'Invalid pump address. Must be between 0x50 and 0x6F'
        });
      }

      // Disconnect if currently connected
      if (serialHandler.getConnectionStatus()) {
        await serialHandler.disconnect();
      }

      // Update configuration
      serialHandler.updateConfig({ port, baudRate, pumpAddress: address as PumpAddress });

      // Reconnect with new settings
      await serialHandler.connect();

      res.json({
        success: true,
        config: {
          port,
          baudRate,
          pumpAddress: `0x${address.toString(16).toUpperCase()}`
        }
      });
    } catch (error: any) {
      console.error('Error updating config:', error);
      res.status(500).json({
        error: error.message || 'Failed to update configuration'
      });
    }
  });

  /**
   * GET /api/history
   * Get transaction history (placeholder - would need to implement storage)
   */
  router.get('/history', (req: Request, res: Response) => {
    // TODO: Implement transaction history storage
    res.json({
      history: [],
      message: 'Transaction history not yet implemented'
    });
  });

  return router;
}

/**
 * Parse command request from API
 */
function parseCommandRequest(command: any): CommandTransactionData {
  switch (command.type) {
    case 'CD1':
      return CommandEncoders.commandToPump(command.data.command);
    
    case 'CD2':
      return CommandEncoders.allowedNozzleNumbers(command.data.nozzles);
    
    case 'CD3':
      return CommandEncoders.presetVolume(command.data.volume);
    
    case 'CD4':
      return CommandEncoders.presetAmount(command.data.amount);
    
    case 'CD5':
      return CommandEncoders.priceUpdate(command.data.prices);
    
    case 'CD7':
      return CommandEncoders.commandToOutput(
        command.data.outputFunction,
        command.data.command
      );
    
    case 'CD9':
      return CommandEncoders.setPumpParameters(command.data);
    
    case 'CD13':
      return CommandEncoders.setFillingType(command.data.fillingType);
    
    case 'CD14':
      return CommandEncoders.suspendRequest(command.data.nozzle);
    
    case 'CD15':
      return CommandEncoders.resumeRequest(command.data.nozzle);
    
    case 'CD101':
      return CommandEncoders.requestTotalCounters(command.data.counter);
    
    default:
      throw new Error(`Unknown command type: ${command.type}`);
  }
}

/**
 * Generate unique command ID
 */
function generateCommandId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

